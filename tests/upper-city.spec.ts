import {test,expect} from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import {Box3,Euler,Group,InstancedMesh,Matrix4,Object3D,Quaternion,Vector3} from 'three';
import {createCityBlueprint} from '../src/simulation/city-blueprint';
import {createCityWorld} from '../src/simulation/city-world';
import {createUpperCityDistricts,UPPER_REPLACED_LANDMARKS} from '../src/simulation/upper-city';
import {urbanCourse,urbanEntrances} from '../src/simulation/urban-world';
import {urbanFloorAt,urbanLotFits} from '../src/simulation/urban-grammar';
import {createPhysics} from '../src/physics/physics';
import {createState} from '../src/simulation/state';
import {createCameraRig} from '../src/cameras/cameras';
import {FIXED_DT,IDLE_INPUT} from '../src/simulation/types';
import type {Vec3} from '../src/simulation/types';
import {createNpcNavigation,createPopulation,stepPopulation} from '../src/simulation/npcs';
import {createNpcResidency,npcTierCounts,npcArea,stepResidentPopulation} from '../src/simulation/npc-residency';
import {upperStructureJobs} from '../src/render/upper-structures';

function upperWorld(){
  const core=createCityWorld('core'),urban=createUpperCityDistricts(core.blueprint),areas=urban.map(d=>urbanCourse(d,core.blueprint.seed));
  const course={...core.residentCourse,id:'m9.upper-focused',spawn:urban[0]!.route[0]!,
    boxes:[...core.residentCourse.boxes.filter(b=>!UPPER_REPLACED_LANDMARKS.includes(b.id)),...areas.flatMap(a=>a.boxes)],
    surfaces:[...core.residentCourse.surfaces!,...areas.flatMap(a=>a.surfaces??[])]};
  return {blueprint:core.blueprint,urban,course,entrances:urban.flatMap(urbanEntrances)};
}

test('M9 upper districts serialize deterministically, preserve macro geometry and distinguish the production recipes',async()=>{
  const blueprint=createCityBlueprint(),before=JSON.parse(JSON.stringify(blueprint)),urban=createUpperCityDistricts(blueprint);
  expect(blueprint).toEqual(before);expect(createUpperCityDistricts(createCityBlueprint())).toEqual(urban);
  expect(JSON.parse(JSON.stringify(urban))).toEqual(urban);expect(urban.map(d=>d.id)).toEqual(['noble-quarter','temple-quarter','upper-city']);
  for(const d of urban){
    expect(d.buildings.length).toBeGreaterThan(12);expect(d.npcs.definitions.length).toBeGreaterThanOrEqual(20);expect(d.route.at(-1)).toEqual(d.route[0]);
    expect(d.buildings.filter(b=>b.awning).length).toBeGreaterThan(3);expect(d.structures!.length).toBeGreaterThan(10);expect(d.lamps.length).toBeGreaterThan(0);
    for(const b of d.buildings){expect(urbanLotFits(blueprint,b,1),b.id).toBe(true);for(const e of urbanEntrances({...d,buildings:[b]})){
      const a={...e.position,x:e.position.x+Math.sin(e.yaw)*1.1,z:e.position.z+Math.cos(e.yaw)*1.1};
      expect(urbanFloorAt(blueprint,e.position.x,e.position.z),e.id).toBeCloseTo(e.position.y,2);
      expect(urbanFloorAt(blueprint,a.x,a.z),e.id).toBeCloseTo(a.y,2);
    }}
  }
  expect(urban[0]!.buildings.every(b=>b.recipe==='noble-house'||b.recipe==='upper-house')).toBe(true);
  expect(urban[1]!.buildings.filter(b=>b.recipe==='academy-house').length).toBeGreaterThan(urban[1]!.buildings.length*.7);
  expect(urban[2]!.buildings.filter(b=>b.recipe==='upper-house'||b.recipe==='noble-house').length).toBeGreaterThan(urban[2]!.buildings.length*.7);
  const heroes=urban.flatMap(d=>d.buildings.filter(b=>b.hero)).map(b=>({id:b.id,position:b.position,width:b.width,depth:b.depth,floors:b.floors}));
  expect(heroes.some(b=>b.id.endsWith('academy-tower')&&b.position.x===340&&b.position.z===-420&&b.floors===7)).toBe(true);
  expect(heroes.filter(b=>b.position.y===40).length).toBe(3);
  console.log(JSON.stringify(urban.map(d=>({id:d.id,buildings:d.buildings.length,structures:d.structures!.length,locals:d.npcs.definitions.length,
    shelters:Object.keys(d.npcs.nodes).filter(k=>k.includes('.shelter.')&&!k.endsWith('.join')).length,gardens:d.gardens!.length,lamps:d.lamps.length}))));
  await test.info().attach('upper-inventory',{contentType:'application/json',body:Buffer.from(JSON.stringify({heroes,urban:urban.map(d=>({id:d.id,buildings:d.buildings.length,
    structures:d.structures!.length,npcs:d.npcs.definitions.length,gardens:d.gardens!.length,planting:d.planting!.length,lamps:d.lamps.length,assumptions:d.assumptions}))}))});
});

for(const mode of ['third-person','first-person'] as const)for(const id of ['noble-quarter','temple-quarter','upper-city'] as const)
test(`M9 ${id} local streets, service lanes, gates and supported doors traverse Rapier in ${mode}`,async()=>{
  test.setTimeout(180000);const city=upperWorld(),district=city.urban.find(d=>d.id===id)!,physics=await createPhysics(city.course),state=createState(city.course);
  state.paused=false;state.camera.mode=mode;const rig=createCameraRig(state,physics,city.blueprint);let steps=0;
  const walk=(target:Vec3)=>{
    const start={...state.player.position},limit=Math.ceil((Math.hypot(target.x-start.x,target.z-start.z)/5.4+7)/FIXED_DT);
    for(let frame=0;frame<limit;frame++){
      const q=state.player.position,dx=target.x-q.x,dz=target.z-q.z,d=Math.hypot(dx,dz);if(d<.06&&Math.hypot(state.player.velocity.x,state.player.velocity.z)<.1)break;
      state.camera.yaw=Math.atan2(-dx,-dz);physics.step(state,{...IDLE_INPUT,forward:d<.6?Math.min(1,d*2):1,run:d>1.4},FIXED_DT);
      if(++steps%12===0){rig.update(.2,1.6);expect(rig.camera.position.toArray().every(Number.isFinite)).toBe(true);}
    }
    for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
    expect(Math.hypot(state.player.position.x-target.x,state.player.position.z-target.z),JSON.stringify({target,actual:state.player.position})).toBeLessThan(.19);
    expect(Math.abs(state.player.position.y-target.y)).toBeLessThan(.17);expect(state.player.grounded).toBe(true);
  };
  try{
    const paths=[district.route,...district.streets.map(s=>s.points)];
    for(const path of paths){physics.reset(state,path[0]);for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);const resets=state.resets;
      for(const target of path.slice(1))walk(target);expect(state.resets).toBe(resets);}
    for(const e of city.entrances.filter(e=>e.id.startsWith(`m9.${id}.`))){
      physics.reset(state,{x:e.position.x+Math.sin(e.yaw)*1.1,y:e.position.y,z:e.position.z+Math.cos(e.yaw)*1.1});const resets=state.resets;walk(e.position);expect(state.resets).toBe(resets);
    }
    await test.info().attach('local-traversal',{contentType:'application/json',body:Buffer.from(JSON.stringify({id,mode,steps,isolatedPathSetups:paths.length,
      doorSetups:city.entrances.filter(e=>e.id.startsWith(`m9.${id}.`)).length,recoveryResets:0,jumps:0}))});
  }finally{rig.dispose();physics.dispose();}
});

test('M9 every upper NPC navigation edge is grounded and capsule-clear including shelter connections',async()=>{
  test.setTimeout(180000);await RAPIER.init();const city=upperWorld(),world=new RAPIER.World({x:0,y:0,z:0}),ids=new Map<number,string>();
  for(const s of city.course.surfaces!){const c=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(s.vertices),new Uint32Array(s.indices)));ids.set(c.handle,s.id);}
  for(const b of city.course.boxes.filter(b=>b.collides)){
    const rotation=new Quaternion().setFromEuler(new Euler(b.rotationX??0,b.rotationY??0,b.rotationZ??0));
    const c=world.createCollider(RAPIER.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2).setTranslation(b.position.x,b.position.y,b.position.z)
      .setRotation(rotation));ids.set(c.handle,b.id);
  }world.step();const failures:string[]=[],shape=new RAPIER.Capsule(.62,.22);let samples=0;
  try{for(const u of city.urban)for(const [aId,bId] of u.npcs.edges){
    const a=u.npcs.nodes[aId]!,b=u.npcs.nodes[bId]!,count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.3));
    for(let i=0;i<=count;i++){
      const t=i/count,q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},hits:string[]=[];
      world.intersectionsWithShape({...q,y:q.y+.87},{x:0,y:0,z:0,w:1},shape,c=>{hits.push(ids.get(c.handle)!);return true;});
      const floor=world.castRayAndGetNormal(new RAPIER.Ray({...q,y:q.y+.15},{x:0,y:-1,z:0}),.35,true);
      if(hits.length||!floor||floor.normal.y<.94)if(failures.length<40)failures.push(`${aId}->${bId}: ${JSON.stringify(q)} ${hits} floor=${floor?.timeOfImpact}`);samples++;
    }
  }expect(samples).toBeGreaterThan(1200);expect(failures).toEqual([]);}finally{world.free();}
});

test('M9 upper identities reuse persisted navigation, residency and rain/night shelter state',()=>{
  const city=upperWorld(),navigation=createNpcNavigation(city.urban.map(d=>d.npcs)),population=createPopulation(true,navigation),residency=createNpcResidency();
  const player={x:280,y:30,z:-405};
  for(let i=0;i<600;i++)stepResidentPopulation(population,residency,FIXED_DT,{weather:'clear',timeOfDay:'day'},player,['temple-quarter'],['temple-quarter'],null,navigation);
  const temple=population.filter(n=>n.id.startsWith('m9.temple-quarter.')),other=population.filter(n=>n.id.startsWith('m9.')&&!n.id.startsWith('m9.temple-quarter.'));
  expect(temple.some(n=>n.distanceTravelled>0)).toBe(true);expect(other.every(n=>n.distanceTravelled===0)).toBe(true);
  for(const n of population.filter(n=>n.id.startsWith('m9.')))expect(npcArea(n.id)).toBe(n.id.split('.')[1]);
  const copy=JSON.parse(JSON.stringify(population));
  for(let i=0;i<300;i++){stepPopulation(population,FIXED_DT,{weather:'rain',timeOfDay:'night'},player,null,navigation);stepPopulation(copy,FIXED_DT,{weather:'rain',timeOfDay:'night'},player,null,navigation);}
  expect(copy).toEqual(population);expect(npcTierCounts(population,residency).uniqueIds).toBe(population.length);
});

test('M9 structural rendering uses one owned batch with exact shared transforms and instance colors',()=>{
  const d=createUpperCityDistricts(createCityBlueprint())[1]!,target=new Group(),owned:{dispose():void}[]=[];
  const scope={own<T extends {dispose():void}>(resource:T){owned.push(resource);return resource;},release(resource:{dispose():void}){resource.dispose();}};
  const labels=[...upperStructureJobs(d.structures!,scope,target)];expect(labels).toContain('upper.structural-batch');expect(target.children.length).toBe(1);
  const mesh=target.children[0] as InstancedMesh;expect(mesh.count).toBe(d.structures!.length);expect(mesh.instanceColor!.count).toBe(mesh.count);
  const matrix=new Matrix4(),object=new Object3D();
  for(const [index,box] of d.structures!.entries()){
    object.position.set(box.position.x,box.position.y,box.position.z);object.scale.set(box.size.x,box.size.y,box.size.z);
    object.rotation.set(box.rotationX??0,box.rotationY??0,box.rotationZ??0);object.updateMatrix();mesh.getMatrixAt(index,matrix);
    for(let n=0;n<16;n++)expect(matrix.elements[n]).toBeCloseTo(object.matrix.elements[n]!,4);
    if(box.id.includes('.arch-rib.'))expect(Math.abs(new Vector3(0,0,1).applyQuaternion(object.quaternion).y)).toBeLessThan(.00001);
  }
  const noble=createUpperCityDistricts(createCityBlueprint())[0]!;
  for(const rib of noble.structures!.filter(b=>b.id.includes('.southern-relieving-rib.'))){
    const q=new Quaternion().setFromEuler(new Euler(rib.rotationX??0,rib.rotationY??0,rib.rotationZ??0));
    expect(Math.abs(new Vector3(0,0,1).applyQuaternion(q).y)).toBeLessThan(.00001);
    expect(new Vector3(0,0,1).applyQuaternion(q).z).toBeCloseTo(1,5);
  }
  expect(owned.length).toBe(3);for(const resource of owned)resource.dispose();
});

for(const mode of ['third-person','first-person'] as const)test(`M9 upper stairs, bridge approaches and terrace gate crossings retain actual controller clearance in ${mode}`,async()=>{
  test.setTimeout(180000);const city=upperWorld(),physics=await createPhysics(city.course),state=createState(city.course);
  state.paused=false;state.camera.mode=mode;
  const ids=['court-ascent','west-court-stairs','noble-stair-cut','upper-court-road','civic-high-bridge','northern-high-bridge','east-bank-retaining-street','bank-garden-stairs'];
  let steps=0;
  try{for(const id of ids){
    const road=city.blueprint.roads.find(r=>r.id===id)!;physics.reset(state,road.points[0]);const resets=state.resets;
    for(let n=0;n<24;n++)physics.step(state,IDLE_INPUT,FIXED_DT);
    for(const target of road.points.slice(1)){
      const start={...state.player.position},limit=Math.ceil((Math.hypot(target.x-start.x,target.z-start.z)/5.4+7)/FIXED_DT);
      for(let n=0;n<limit;n++){
        const q=state.player.position,dx=target.x-q.x,dz=target.z-q.z,d=Math.hypot(dx,dz);
        if(d<.08&&Math.hypot(state.player.velocity.x,state.player.velocity.z)<.12)break;
        state.camera.yaw=Math.atan2(-dx,-dz);physics.step(state,{...IDLE_INPUT,forward:d<.6?Math.min(1,d*2):1,run:d>1.4},FIXED_DT);steps++;
      }
      for(let n=0;n<24;n++)physics.step(state,IDLE_INPUT,FIXED_DT);
      expect(Math.hypot(state.player.position.x-target.x,state.player.position.z-target.z),JSON.stringify({id,target,actual:state.player.position})).toBeLessThan(.2);
      expect(Math.abs(state.player.position.y-target.y)).toBeLessThan(.17);expect(state.player.grounded).toBe(true);expect(state.resets).toBe(resets);
    }
  }await test.info().attach('upper-access-clearance',{contentType:'application/json',body:Buffer.from(JSON.stringify({mode,ids,steps,isolatedRoadSetups:ids.length,recoveryResets:0,jumps:0}))});
  }finally{physics.dispose();}
});

test('M9 every upper evidence bookmark has actual full-city ground support and a clear physical capsule',async()=>{
  await RAPIER.init();const city=createCityWorld('upper'),world=new RAPIER.World({x:0,y:0,z:0}),ids=new Map<number,string>();
  for(const s of city.course.surfaces!){const c=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(s.vertices),new Uint32Array(s.indices)));ids.set(c.handle,s.id);}
  for(const b of city.course.boxes.filter(b=>b.collides)){
    const rotation=new Quaternion().setFromEuler(new Euler(b.rotationX??0,b.rotationY??0,b.rotationZ??0));
    const c=world.createCollider(RAPIER.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2).setTranslation(b.position.x,b.position.y,b.position.z)
      .setRotation(rotation));ids.set(c.handle,b.id);
  }world.step();const failures:string[]=[],shape=new RAPIER.Capsule(.575,.3);let count=0;
  try{for(const d of city.urban.filter(d=>d.id==='noble-quarter'||d.id==='temple-quarter'||d.id==='upper-city'))for(const [name,v] of Object.entries(d.views)){
    const hits:string[]=[],q=v.position;world.intersectionsWithShape({...q,y:q.y+.875},{x:0,y:0,z:0,w:1},shape,c=>{hits.push(ids.get(c.handle)!);return true;});
    const floor=world.castRayAndGetNormal(new RAPIER.Ray({...q,y:q.y+.13},{x:0,y:-1,z:0}),.35,true);
    if(hits.length||!floor||floor.normal.y<.94)failures.push(`${d.id}.${name}: ${hits.join(',')} floor=${floor?.timeOfImpact}`);count++;
  }expect(count).toBe(12);expect(failures).toEqual([]);}finally{world.free();}
});

for(const mode of ['third-person','first-person'] as const)test(`M9 exposed bank service platforms connect to real terrain and contain an outward fall attempt in ${mode}`,async()=>{
  const city=upperWorld(),physics=await createPhysics(city.course),state=createState(city.course);state.paused=false;state.camera.mode=mode;
  const decks=city.urban.find(d=>d.id==='temple-quarter')!.structures!.filter(b=>b.id.includes('.bank-service-ledge.'));
  try{for(const deck of decks){
    const y=deck.position.y+deck.size.y/2,start={x:deck.position.x+deck.size.x/2+1,y:y+.04,z:deck.position.z};
    expect(urbanFloorAt(city.blueprint,start.x,start.z)).toBeCloseTo(y,2);physics.reset(state,start);
    for(let n=0;n<24;n++)physics.step(state,IDLE_INPUT,FIXED_DT);const resets=state.resets;
    for(let n=0;n<360;n++){
      const dx=deck.position.x-state.player.position.x;if(Math.abs(dx)<.08)break;
      state.camera.yaw=dx<0?Math.PI/2:-Math.PI/2;physics.step(state,{...IDLE_INPUT,forward:Math.abs(dx)<.6?Math.abs(dx)*2:1},FIXED_DT);
    }
    expect(Math.abs(state.player.position.x-deck.position.x)).toBeLessThan(.15);expect(state.player.grounded).toBe(true);
    expect(Math.abs(state.player.position.y-y)).toBeLessThan(.1);state.camera.yaw=Math.PI/2;
    for(let n=0;n<180;n++)physics.step(state,{...IDLE_INPUT,forward:1,run:true},FIXED_DT);
    expect(state.player.position.x).toBeGreaterThan(deck.position.x-deck.size.x/2+.3);
    expect(state.player.grounded).toBe(true);expect(Math.abs(state.player.position.y-y)).toBeLessThan(.1);expect(state.resets).toBe(resets);
  }}finally{physics.dispose();}
});

test('M9 landward high-bridge frames fit real terrain and clear accepted decks, facades and persistent navigation',async()=>{
  await RAPIER.init();const city=upperWorld(),d=city.urban.find(d=>d.id==='temple-quarter')!,supports=d.structures!.filter(b=>b.id.includes('.bridge-bank-frame.'));
  expect(supports.length).toBe(15);const approach=city.blueprint.roads.find(r=>r.id==='civic-high-bridge')!;
  const deckOnly={...city.blueprint,terrain:[],roads:[approach]},terrainOnly={...city.blueprint,roads:[]};
  const object=new Object3D(),world=new RAPIER.World({x:0,y:0,z:0}),ids=new Map<number,string>();
  for(const b of supports){
    object.position.set(b.position.x,b.position.y,b.position.z);object.scale.set(b.size.x,b.size.y,b.size.z);
    object.rotation.set(b.rotationX??0,b.rotationY??0,b.rotationZ??0);object.updateMatrix();
    expect([b.size.x,b.size.y,b.size.z].every(n=>n>0&&Number.isFinite(n))).toBe(true);
    for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
      const q=new Vector3(x,y,z).applyMatrix4(object.matrix),deck=urbanFloorAt(deckOnly,q.x,-385)!;
      expect(q.y,`${b.id} intersects authoritative deck`).toBeLessThan(deck-.015);
    }
    if(!b.id.endsWith('.deck-underside')&&!b.id.endsWith('.header')){
      const bounds=new Box3(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5)).applyMatrix4(object.matrix);
      const closest=Math.min(Math.abs(bounds.min.z+385),Math.abs(bounds.max.z+385));
      expect(closest,`${b.id} intrudes deck shoulder`).toBeGreaterThan(approach.width/2+.38);
    }
    if(b.id.includes('.foot.'))for(const x of [-.55,.55])for(const z of [-.55,.55])
      expect(urbanFloorAt(terrainOnly,b.position.x+x,b.position.z+z),b.id).toBeCloseTo(b.position.y-b.size.y/2,3);
    if(b.id.endsWith('.header'))expect(b.position.y-b.size.y/2-22).toBeGreaterThan(2.2);
    const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2)
      .setTranslation(b.position.x,b.position.y,b.position.z).setRotation(object.quaternion));ids.set(collider.handle,b.id);
  }world.step();const failures:string[]=[],shape=new RAPIER.Capsule(.62,.3);let routeSamples=0,npcSamples=0;
  const inspect=(q:Vec3,label:string)=>world.intersectionsWithShape({...q,y:q.y+.89},{x:0,y:0,z:0,w:1},shape,c=>{
    if(failures.length<20)failures.push(`${label}: ${ids.get(c.handle)}`);return true;});
  try{
    for(const road of city.blueprint.roads.filter(r=>['civic-high-bridge','east-bank-retaining-street','bank-garden-stairs','temple-court','northern-high-bridge'].includes(r.id)))
      for(let i=1;i<road.points.length;i++){
        const a=road.points[i-1]!,b=road.points[i]!,count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.3));
        for(let n=0;n<=count;n++){const t=n/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
          inspect({x,y:urbanFloorAt(city.blueprint,x,z)!+.025,z},road.id);routeSamples++;}
      }
    for(const district of city.urban)for(const [aId,bId] of district.npcs.edges){
      const a=district.npcs.nodes[aId]!,b=district.npcs.nodes[bId]!,count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.3));
      for(let n=0;n<=count;n++){const t=n/count;inspect({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},`${aId}->${bId}`);npcSamples++;}
    }
    for(const building of d.buildings){
      const q=building.position,height=building.floors*building.floorHeight,rotation=new Quaternion().setFromEuler(new Euler(0,building.yaw,0));
      world.intersectionsWithShape({...q,y:q.y+height/2},rotation,new RAPIER.Cuboid(building.width/2,height/2,building.depth/2),c=>{
        failures.push(`${building.id} facade: ${ids.get(c.handle)}`);return true;});
    }
    expect(routeSamples).toBeGreaterThan(1000);expect(npcSamples).toBeGreaterThan(1500);expect(failures).toEqual([]);
    await test.info().attach('high-bridge-support-clearance',{contentType:'application/json',body:Buffer.from(JSON.stringify({structures:supports.length,routeSamples,npcSamples,
      originalRoad:approach,scope:'Geometry and isolated Rapier support-clearance queries; full public traversal is separately tested in both cameras.'}))});
  }finally{world.free();}
});
