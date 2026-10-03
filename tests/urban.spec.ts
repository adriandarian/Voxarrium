import { test,expect } from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createCityWorld,cityDemand,citySafetyGates,cityBoundaryDistance } from '../src/simulation/city-world';
import { createCityBlueprint } from '../src/simulation/city-blueprint';
import { createPhysics } from '../src/physics/physics';
import { createState } from '../src/simulation/state';
import { createCameraRig } from '../src/cameras/cameras';
import { FIXED_DT,IDLE_INPUT } from '../src/simulation/types';
import { createNpcNavigation,createPopulation,stepPopulation } from '../src/simulation/npcs';
import { createNpcResidency,stepResidentPopulation,npcTierCounts } from '../src/simulation/npc-residency';
import { diagnoseUrbanRepetition } from '../src/diagnostics/urban-repetition';
import type { Vec3 } from '../src/simulation/types';

test('M7 keeps accepted courses, fourteen-district graph and macro geometry while producing two distinct grammars',()=>{
  const original=createCityWorld(),production=createCityWorld(true);
  expect(production.acceptedCourses).toEqual(original.acceptedCourses);
  const blueprint=createCityBlueprint();
  for(const key of ['districts','roads','terrain','waterways','connections','terraces','massing','landmarks'] as const)expect(production.blueprint[key]).toEqual(blueprint[key]);
  expect(production.urban.map(u=>u.id)).toEqual(['central-market','lower-canal']);
  expect(production.areas.filter(a=>a.urban).map(a=>a.assetIds)).toEqual([['district.kit'],['district.kit']]);
  expect(JSON.parse(JSON.stringify(production.urban))).toEqual(production.urban);
  const [market,canal]=production.urban;
  expect(market!.buildings.filter(b=>b.floors>=3).length).toBeGreaterThan(canal!.buildings.filter(b=>b.floors>=3).length);
  expect(market!.stalls.length).toBeGreaterThan(canal!.stalls.length);
  for(const u of production.urban){expect(u.buildings.some(b=>b.hero)).toBe(true);expect(u.assumptions.length).toBeGreaterThan(0);}
});

for(const mode of ['third-person','first-person'] as const)for(const id of ['central-market','lower-canal'] as const)
test(`M7 ${id} local routes and door approaches traverse real collision in ${mode}`,async()=>{
  test.setTimeout(120_000);
  const world=createCityWorld(true),district=world.urban.find(u=>u.id===id)!;
  const physics=await createPhysics(world.course),state=createState(world.course);
  state.paused=false;state.camera.mode=mode;
  const rig=createCameraRig(state,physics,world.blueprint);
  let steps=0;
  async function walk(target:Vec3){
    const from={...state.player.position},limit=Math.ceil((Math.hypot(target.x-from.x,target.z-from.z)/5.4+5)/FIXED_DT);
    for(let frame=0;frame<limit;frame++){
      const p=state.player.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
      if(d<.06&&Math.hypot(state.player.velocity.x,state.player.velocity.z)<.1)break;
      state.camera.yaw=Math.atan2(-dx,-dz);physics.step(state,{...IDLE_INPUT,forward:d<.6?Math.min(1,d*2):1,run:d>1.4},FIXED_DT);
      if(++steps%12===0){rig.update(.2,1.6);expect(rig.camera.position.toArray().every(Number.isFinite)).toBe(true);}
    }
    for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
    expect(Math.hypot(state.player.position.x-target.x,state.player.position.z-target.z),JSON.stringify({target,actual:state.player.position})).toBeLessThan(.18);
    expect(Math.abs(state.player.position.y-target.y)).toBeLessThan(.16);expect(state.player.grounded).toBe(true);
  }
  try{
    const paths=[district.route,...district.streets.map(s=>s.points)];
    for(const path of paths){if(!path.length)continue;physics.reset(state,path[0]);for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      const resets=state.resets;for(const target of path.slice(1))await walk(target);expect(state.resets).toBe(resets);
    }
    for(const entrance of world.entrances.filter(e=>e.id.startsWith(`m7.${id}`))){
      const approach={x:entrance.position.x+Math.sin(entrance.yaw)*1.1,y:entrance.position.y,z:entrance.position.z+Math.cos(entrance.yaw)*1.1};
      physics.reset(state,approach);await walk(entrance.position);
    }
    await test.info().attach('route-facts',{contentType:'application/json',body:Buffer.from(JSON.stringify({id,mode,steps,isolatedPathSetupResets:paths.length,doorSetups:world.entrances.filter(e=>e.id.startsWith(`m7.${id}`)).length,jumps:0}))});
  }finally{rig.dispose();physics.dispose();}
});

test('M7 NPC graph capsules clear real proxies and have grounded, continuous shelter routes',async()=>{
  test.setTimeout(120_000);await RAPIER.init();const city=createCityWorld(true),world=new RAPIER.World({x:0,y:0,z:0});
  const ids=new Map<number,string>();
  for(const s of city.course.surfaces??[]){const c=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(s.vertices),new Uint32Array(s.indices)));ids.set(c.handle,s.id);}
  for(const b of city.course.boxes.filter(b=>b.collides)){
    const yaw=b.rotationY??0,pitch=b.rotationX??0,sx=Math.sin(pitch/2),cx=Math.cos(pitch/2),sy=Math.sin(yaw/2),cy=Math.cos(yaw/2);
    const c=world.createCollider(RAPIER.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2).setTranslation(b.position.x,b.position.y,b.position.z).setRotation({x:sx*cy,y:cx*sy,z:sx*sy,w:cx*cy}));ids.set(c.handle,b.id);
  }world.step();const failures:string[]=[],shape=new RAPIER.Capsule(.62,.22);let samples=0;
  try{for(const u of city.urban)for(const [aId,bId] of u.npcs.edges){
    const a=u.npcs.nodes[aId]!,b=u.npcs.nodes[bId]!,count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.3));
    for(let i=0;i<=count;i++){
      const t=i/count,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},hits:string[]=[];
      world.intersectionsWithShape({...p,y:p.y+.87},{x:0,y:0,z:0,w:1},shape,c=>{hits.push(ids.get(c.handle)!);return true;});
      const floor=world.castRayAndGetNormal(new RAPIER.Ray({...p,y:p.y+.15},{x:0,y:-1,z:0}),.35,true);
      if(hits.length||!floor||floor.normal.y<.94)if(failures.length<30)failures.push(`${aId}->${bId}: ${JSON.stringify(p)} ${hits} floor=${floor?.timeOfImpact}`);samples++;
    }
  }expect(samples).toBeGreaterThan(500);expect(failures).toEqual([]);}finally{world.free();}
});

test('M7 new locals preserve identity, JSON continuation and offscreen progress under existing residency',()=>{
  const city=createCityWorld(true),navigation=createNpcNavigation(city.urban.map(u=>u.npcs)),population=createPopulation(true,navigation),residency=createNpcResidency();
  const day={weather:'clear',timeOfDay:'day'} as const,player={x:110,y:12,z:-235};
  for(let i=0;i<600;i++)stepResidentPopulation(population,residency,FIXED_DT,day,player,['central-market'],['central-market'],null,navigation);
  const canal=population.filter(n=>n.id.startsWith('m7.lower-canal.'));expect(canal.every(n=>n.distanceTravelled===0)).toBe(true);
  expect(population.some(n=>n.id.startsWith('m7.central-market.')&&n.distanceTravelled>0)).toBe(true);
  const copy=JSON.parse(JSON.stringify(population));
  for(let i=0;i<300;i++){stepPopulation(population,FIXED_DT,{weather:'rain',timeOfDay:'night'},player,null,navigation);stepPopulation(copy,FIXED_DT,{weather:'rain',timeOfDay:'night'},player,null,navigation);}
  expect(copy).toEqual(population);expect(npcTierCounts(population,residency).uniqueIds).toBe(population.length);expect(population.length).toBeGreaterThan(80);
});

test('repetition diagnostics expose concrete duplicates and nearby roof identities',()=>{
  const u=createCityWorld(true).urban[0]!,b=u.buildings[0]!;
  const duplicate={...b,id:'diagnostic.duplicate',position:{...b.position,x:b.position.x+1}};
  const report=diagnoseUrbanRepetition({...u,buildings:[b,duplicate]});
  expect(new Set(report.findings.map(f=>f.kind))).toEqual(new Set(['facade-sequence','neighbor-roofs','silhouette','shopfront']));
  for(const f of report.findings)expect(f.buildingIds).toContain('diagnostic.duplicate');
  expect('varietyScore' in report).toBe(false);
});

test('Lower Canal center leaves its stair junction with only its streamed colliders and unavailable-neighbor guards',async()=>{
  test.setTimeout(120_000);
  const city=createCityWorld(true),physics=await createPhysics(city.residentCourse),state=createState(city.course);
  state.paused=false;
  try{
    physics.loadArea('lower-canal',city.areas.find(a=>a.id==='lower-canal')!.course);
    physics.reset(state,{x:310,y:4.04,z:-165});
    for(let i=0;i<30;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
    const start={...state.player.position},target={x:315,z:-87},resets=state.resets;
    for(let i=0;i<2400;i++){
      physics.streamingGates(['lower-canal'],state.player.position,citySafetyGates(city.blueprint,['lower-canal'],state.player.position));
      const p=state.player.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
      if(d<.15)break;
      state.camera.yaw=Math.atan2(-dx,-dz);
      physics.step(state,{...IDLE_INPUT,forward:d<.8?Math.min(1,d*1.7):1,run:d>1.5},FIXED_DT);
    }
    const nearbyGuards=citySafetyGates(city.blueprint,['lower-canal'],state.player.position).filter(b=>Math.hypot(b.position.x-state.player.position.x,b.position.z-state.player.position.z)<8);
    expect(Math.hypot(state.player.position.x-target.x,state.player.position.z-target.z),JSON.stringify({start,actual:state.player.position,nearbyGuards})).toBeLessThan(.2);
    expect(state.resets).toBe(resets);
  }finally{physics.dispose();}
});

for(const mode of ['third-person','first-person'] as const)test(`Canal north-quay turn retains its lease and cold handoffs stay supported in ${mode}`,async()=>{
  const city=createCityWorld(true),physics=await createPhysics(city.residentCourse),state=createState(city.course);
  state.paused=false;state.camera.mode=mode;
  // This exact warm-route turn evicted Canal in the actual-input stress run.
  for(const x of [285,280,275,270,265,260])expect(cityDemand(city.areas,{x,y:4,z:-65},{x:-5.4,y:0,z:0})).toContain('lower-canal');
  expect(cityBoundaryDistance(city.areas.find(a=>a.id==='lower-canal')!,{x:260,y:4,z:-75.8},city.urban)).toBeLessThan(1);
  let active=['south-gate'];
  try{
    physics.loadArea('south-gate',city.areas.find(a=>a.id==='south-gate')!.course);
    physics.reset(state,{x:260,y:4.04,z:-75.2});
    for(let i=0;i<30;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
    const resets=state.resets;
    const walk=(target:Vec3,frames:number)=>{
      for(let i=0;i<frames;i++){
        physics.streamingGates(active,state.player.position,citySafetyGates(city.blueprint,active,state.player.position,city.urban));
        const p=state.player.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
        if(d<.15)break;state.camera.yaw=Math.atan2(-dx,-dz);
        physics.step(state,{...IDLE_INPUT,forward:d<.8?Math.min(1,d*1.7):1,run:d>1.5},FIXED_DT);
      }
    };
    const quay={x:262,y:4,z:-82};walk(quay,240);
    expect(state.resets).toBe(resets);expect(state.player.grounded).toBe(true);expect(state.player.position.z).toBeGreaterThan(-77);
    physics.loadArea('lower-canal',city.areas.find(a=>a.id==='lower-canal')!.course);active.push('lower-canal');walk(quay,600);
    expect(Math.hypot(state.player.position.x-quay.x,state.player.position.z-quay.z)).toBeLessThan(.2);
    physics.unloadArea('south-gate');active=['lower-canal'];const outside={x:260,y:4,z:-75.2};walk(outside,240);
    expect(state.resets).toBe(resets);expect(state.player.grounded).toBe(true);expect(state.player.position.z).toBeLessThan(-76.5);
    physics.loadArea('south-gate',city.areas.find(a=>a.id==='south-gate')!.course);active.push('south-gate');walk(outside,600);
    expect(Math.hypot(state.player.position.x-outside.x,state.player.position.z-outside.z)).toBeLessThan(.2);
    expect(state.resets).toBe(resets);expect(state.player.grounded).toBe(true);
  }finally{physics.dispose();}
});
