import {test,expect} from '@playwright/test';
import {Color,DirectionalLight,HemisphereLight,LineSegments,Scene,Mesh,Quaternion,Euler,BoxGeometry,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {createCityWorld,cityDemand,cityBoundaryDistance,citySafetyGates} from '../src/simulation/city-world';
import {createStreamingController} from '../src/simulation/streaming';
import {CITY_CORE_PREPARATION_LEAD_SECONDS} from '../src/simulation/city-core';
import type {AreaId} from '../src/simulation/streaming-contracts';
import {createPhysics} from '../src/physics/physics';
import {createState} from '../src/simulation/state';
import {FIXED_DT,IDLE_INPUT} from '../src/simulation/types';
import type {Vec3,CourseSpec} from '../src/simulation/types';
import {createNpcNavigation,createPopulation} from '../src/simulation/npcs';
import {createNpcResidency,npcArea,stepResidentPopulation} from '../src/simulation/npc-residency';
import {createEnvironment,setEnvironment} from '../src/simulation/environment';
import {createEnvironmentPresentation} from '../src/render/environment';
import {createCityPresentation} from '../src/render/city-blueprint';
import RAPIER from '@dimforge/rapier3d-compat';
import {urbanFloorAt} from '../src/simulation/urban-grammar';

test('M9 rain clips to the actual graded return apron without a flat roof blanket',async()=>{
  const city=createCityWorld('upper'),scene=new Scene(),sun=new DirectionalLight(),fill=new HemisphereLight();scene.add(sun,fill);
  const environment=createEnvironmentPresentation(scene,sun,fill,city.course,[],city.blueprint);
  await RAPIER.init();const world=new RAPIER.World({x:0,y:0,z:0}),surfaceIds=new Map<number,string>();
  for(const surface of city.course.surfaces??[]){
    const collider=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(surface.vertices),new Uint32Array(surface.indices)));
    surfaceIds.set(collider.handle,surface.id);
  }
  world.step();
  const state=createEnvironment();setEnvironment(state,'rain','dusk',true);
  let raisedSamples=0,lowRampSamples=0;
  try{
    for(let tick=0;tick<120;tick++){
      state.time=tick/30;environment.update(state,{x:157,y:49,z:-596},false);
      const rain=scene.getObjectByName('living.rain') as LineSegments,positions=rain.geometry.getAttribute('position');
      for(let i=0;i<environment.stats().rainDrops;i++){
        const x=positions.getX(i*2),z=positions.getZ(i*2);
        const hit=world.castRay(new RAPIER.Ray({x,y:80,z},{x:0,y:-1,z:0}),60,true);
        // Scope this regression to the new apron, rather than unrelated
        // pre-existing road coping that also sits above the macro floor.
        if(!hit||surfaceIds.get(hit.collider.handle)!=='citadel.return-apron')continue;
        const actualFloor=80-hit.timeOfImpact,oldFloor=urbanFloorAt(city.blueprint,x,z);
        if(oldFloor===null||actualFloor-oldFloor<.2)continue;
        raisedSamples++;
        const bottom=positions.getY(i*2+1);
        expect(bottom,JSON.stringify({x,z,actualFloor,oldFloor,tick})).toBeGreaterThanOrEqual(actualFloor+.035);
        if(actualFloor<49&&bottom<49.8)lowRampSamples++;
      }
    }
    expect(raisedSamples).toBeGreaterThan(100);expect(lowRampSamples).toBeGreaterThan(5);
    expect(environment.stats().roofEnvelopes).toEqual([]);
  }finally{environment.dispose();world.free();}
});

for(const leg of ['descent','ascent'] as const)for(const mode of ['third-person','first-person'] as const)test(`M9 native-input citadel ${leg} remains supported in ${mode}`,async()=>{
  test.setTimeout(90000);
  const city=createCityWorld('upper'),start=leg==='descent'?{x:150.2655792236328,y:50.01551818847656,z:-604.7804565429688}:{x:185,y:40.04,z:-550};
  const loaded=city.areas.filter(a=>a.id==='upper-city'||a.id==='citadel');
  const course:CourseSpec={...city.residentCourse,spawn:start,
    boxes:[...city.residentCourse.boxes,...loaded.flatMap(a=>a.course.boxes)],
    surfaces:[...city.residentCourse.surfaces!,...loaded.flatMap(a=>a.course.surfaces??[])]};
  const results=[];
  for(const steerFrames of [5,6]){
    const physics=await createPhysics(course),state=createState(course);state.paused=false;state.camera.mode=mode;
    const target=leg==='descent'?{x:185,y:40,z:-550}:{x:150,y:50,z:-605},samples=[];
    let airborne=0,longestAirborne=0,consecutiveAirborne=0,maxDrop=0,frames=0,running=true;
    try{
      for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      const setupResets=state.resets;
      for(;frames<3600;frames++){
        const before={...state.player.position},d=Math.hypot(before.x-target.x,before.z-target.z);
        if(d<.55)break;
        if(d<1.8)running=false;
        // Native steering holds W and updates yaw around each80ms readback.
        // No settling waits are inserted during the descending leg.
        if(frames%steerFrames===0)state.camera.yaw=Math.atan2(before.x-target.x,before.z-target.z);
        physics.step(state,{...IDLE_INPUT,forward:1,run:running},FIXED_DT);
        const p=state.player.position;
        maxDrop=Math.max(maxDrop,before.y-p.y);
        if(!state.player.grounded){airborne++;consecutiveAirborne++;longestAirborne=Math.max(longestAirborne,consecutiveAirborne);}else consecutiveAirborne=0;
        if(frames%5===0||!state.player.grounded)samples.push({frame:frames,position:{...p},velocity:{...state.player.velocity},grounded:state.player.grounded});
      }
      const arrival={...state.player.position},resets=state.resets-setupResets;
      results.push({mode,steerFrames,frames,airborne,longestAirborne,maxDrop,arrival,resets,samples});
    }finally{physics.dispose();}
  }
  await test.info().attach('native-descent-support',{contentType:'application/json',body:Buffer.from(JSON.stringify({mode,results,
    leg,scope:'Explicit supported court/stair setup with actual integrated resident/upper/citadel collision, continuously held native-like W input. This regression is separate from native cadence and renderer evidence.'}))});
  for(const r of results){
    expect(r.frames).toBeLessThan(3600);expect(r.resets).toBe(0);
    expect(r.airborne,JSON.stringify({mode,steerFrames:r.steerFrames,longestAirborne:r.longestAirborne,maxDrop:r.maxDrop,firstAirborne:r.samples.find(s=>!s.grounded)})).toBe(0);
    // The bounded arrival is still on the accepted slope, short of its foot.
    // Check that actual grade instead of pretending the whole landing is flat.
    const expectedFloor=leg==='ascent'?50:40+10*((185-r.arrival.x)*35+(-550-r.arrival.z)*55)/(35**2+55**2);
    expect(r.arrival.y).toBeCloseTo(expectedFloor+.015,1);
  }
});

for(const approach of ['temple-return','noble-departure','downhill-return'] as const)test(`M9 connected forks prepare measured cold branches before the safety approach: ${approach}`,async()=>{
  test.setTimeout(180000);const city=createCityWorld('upper'),physics=await createPhysics(city.course),state=createState(city.course);
  const road=(id:string)=>city.blueprint.roads.find(r=>r.id===id)!.points;
  const civic=city.urban.find(d=>d.id==='civic-terrace')!;
  const route=approach==='downhill-return'?[...road('garden-ascent')].reverse():
    approach==='temple-return'?[...road('civic-high-bridge')].reverse().concat([...road('civic-ascent')].reverse().slice(1)):
    [...civic.route,...road('court-ascent').slice(1)];
  physics.reset(state,{...route[0]!,y:route[0]!.y+.04});state.paused=false;const setupResets=state.resets;
  let clock=0,startup=true,maximum=0,demand:AreaId[]|undefined,returnNeighbor:AreaId|undefined;
  const costs:Partial<Record<AreaId,number>>={'central-market':26,'noble-quarter':13,'civic-terrace':17,'temple-quarter':16,
    'garden-terrace':18,'south-gate':18};
  const pending:{at:number;resolve:()=>void}[]=[],leases=new Set<string>(),requests:{id:AreaId;at:number;readyAt:number;position:Vec3}[]=[];
  const controller=createStreamingController(city.areas,{async load(area,signal){
    leases.add(area.id);maximum=Math.max(maximum,leases.size);
    try{
      if(!startup&&area.assetIds.length)await new Promise<void>(resolve=>{
        const readyAt=clock+(costs[area.id]??area.coldPreparationSeconds??0);
        requests.push({id:area.id,at:clock,readyAt,position:{...state.player.position}});pending.push({at:readyAt,resolve});
        signal.addEventListener('abort',()=>resolve(),{once:true});
      });
      signal.throwIfAborted();return {activate(){},deactivate(){},unload(){leases.delete(area.id);}};
    }catch(error){leases.delete(area.id);throw error;}
  }},{preparationLeadSeconds:CITY_CORE_PREPARATION_LEAD_SECONDS,unloadRadius:46});
  const advance=async(forward:number,run=false)=>{
    clock+=FIXED_DT;for(const p of pending.filter(p=>p.at<=clock))p.resolve();for(let i=0;i<5;i++)await Promise.resolve();
    const previous=demand?.[0];demand=cityDemand(city.areas,state.player.position,state.player.velocity,demand,returnNeighbor);
    if(previous&&demand[0]!==previous)returnNeighbor=demand[1]===previous?previous:undefined;
    else if(demand[1]!==returnNeighbor)returnNeighbor=undefined;
    controller.update(state.player.position,FIXED_DT,state.player.velocity,demand);
    for(const id of demand)if(cityBoundaryDistance(city.areas.find(a=>a.id===id)!,state.player.position,city.urban)<=1)
      expect(controller.ready(id),JSON.stringify({id,clock,position:state.player.position,demand,pending:controller.snapshot().pendingIds,requests:requests.slice(-6)})).toBe(true);
    physics.streamingGates(controller.activeIds(),state.player.position,citySafetyGates(city.blueprint,controller.activeIds(),state.player.position,city.urban,true));
    physics.step(state,{...IDLE_INPUT,forward,run},FIXED_DT);
  };
  try{
    // Native Temple has already prepared Civic before this bridge departure;
    // the downhill case begins on the prepared Garden return street. These
    // supported setups own the next cold branch, not arbitrary cold spawns.
    demand=approach==='temple-return'?['temple-quarter','civic-terrace']:cityDemand(city.areas,state.player.position,state.player.velocity);
    controller.update(state.player.position,0,state.player.velocity,demand);
    await controller.settled();
    if(approach==='temple-return'){controller.preload('civic-terrace');await controller.settled();expect(controller.ready('civic-terrace')).toBe(true);}
    startup=false;
    for(const target of route.slice(1)){
      let frames=0,running=true;for(;frames<3600;frames++){
        const p=state.player.position,d=Math.hypot(p.x-target.x,p.z-target.z);if(d<.55)break;
        if(d<1.8)running=false;if(frames%5===0)state.camera.yaw=Math.atan2(p.x-target.x,p.z-target.z);await advance(1,running);
      }
      expect(frames,JSON.stringify(target)).toBeLessThan(3600);for(let i=0;i<9;i++)await advance(0);
    }
    expect(state.resets).toBe(setupResets);expect(maximum).toBeLessThanOrEqual(2);expect(controller.snapshot().errors).toEqual([]);
    const target=approach==='downhill-return'?'south-gate':approach==='temple-return'?'central-market':'noble-quarter';
    expect(requests.some(r=>r.id===target)).toBe(true);
    if(approach==='downhill-return')expect(requests.filter(r=>r.id==='south-gate')).toHaveLength(1);
    expect(createCityWorld('core').areas.every(a=>a.coldPreparationSeconds===undefined)).toBe(true);
    await test.info().attach('M9-measured-cold-fork',{contentType:'application/json',body:Buffer.from(JSON.stringify({approach,costs,clock,maximum,requests,
      scope:'Actual Rapier/controller and dynamic safety gates with rounded measured cold preparation costs. Explicit supported setup is separate from natural native cadence; no renderer or arbitrary-latency guarantee.'}))});
  }finally{for(const p of pending)p.resolve();for(let i=0;i<5;i++)await Promise.resolve();controller.dispose();physics.dispose();}
});

test('M9 preserves exact accepted blueprint, M8 districts and original identities',()=>{
  const m8=createCityWorld('core'),m9=createCityWorld('upper');
  for(const key of ['districts','roads','terrain','waterways','connections','terraces','massing','landmarks'] as const)expect(m9.blueprint[key]).toEqual(m8.blueprint[key]);
  expect(m9.acceptedCourses).toEqual(m8.acceptedCourses);expect(m9.urban.slice(0,5)).toEqual(m8.urban);
  expect(m9.coreIds).toHaveLength(11);expect(m9.citadel).not.toBeNull();
  const nav=createNpcNavigation(m9.urban.map(d=>d.npcs)),population=createPopulation(true,nav);
  const old=createPopulation(true,createNpcNavigation(m8.urban.map(d=>d.npcs)));
  expect(population.slice(0,old.length)).toEqual(old);expect(new Set(population.map(n=>n.id)).size).toBe(population.length);
  const residency=createNpcResidency(),restored=JSON.parse(JSON.stringify(population));
  for(const d of m9.urban.slice(5))for(const n of d.npcs.definitions)expect(npcArea(n.id)).toBe(d.id);
  stepResidentPopulation(restored,residency,.1,{weather:'rain',timeOfDay:'night'},{x:150,y:50,z:-605},['citadel'],['citadel'],null,nav);
  for(const n of restored.filter((n:typeof population[number])=>npcArea(n.id)!=='citadel')){
    expect(n.position).toEqual(population.find(old=>old.id===n.id)!.position);expect(residency.entries[n.id]!.tier).toBe('unloaded-data');
  }
});

for(const mode of ['third-person','first-person'] as const)test(`M9 natural complete circuit has collision support in ${mode}`,async()=>{
  test.setTimeout(240000);const world=createCityWorld('upper'),physics=await createPhysics(world.course),state=createState(world.course);
  state.paused=false;state.camera.mode=mode;let steps=0;
  const walk=(target:Vec3)=>{
    const from={...state.player.position},limit=Math.ceil((Math.hypot(target.x-from.x,target.z-from.z)/5.4+6)/FIXED_DT);
    for(let n=0;n<limit;n++){
      const p=state.player.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(d<.06)break;
      state.camera.yaw=Math.atan2(-dx,-dz);physics.step(state,{...IDLE_INPUT,forward:d<.6?Math.min(1,d*2):1,run:d>1.4},FIXED_DT);steps++;
    }
    for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
    expect(Math.hypot(state.player.position.x-target.x,state.player.position.z-target.z),JSON.stringify({target,actual:state.player.position})).toBeLessThan(.2);
    expect(state.player.position.y,JSON.stringify(target)).toBeCloseTo(target.y,0);expect(state.player.grounded).toBe(true);
  };
  try{
    for(const target of world.route.slice(1))walk(target);expect(state.resets).toBe(0);
    await test.info().attach('M9-route',{contentType:'application/json',body:Buffer.from(JSON.stringify({mode,steps,route:world.route,resets:state.resets,scope:'Actual Rapier/controller natural full route; NPC collision samples separate from native renderer cadence.'}))});
  }finally{physics.dispose();}
});

test('M9 Citadel staff routes clear actual Rapier solids and supported floors',async()=>{
  const city=createCityWorld('upper');await RAPIER.init();const world=new RAPIER.World({x:0,y:0,z:0}),ids=new Map<number,string>();
  for(const s of city.course.surfaces??[]){const c=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(s.vertices),new Uint32Array(s.indices)));ids.set(c.handle,s.id);}
  for(const b of city.course.boxes.filter(b=>b.collides)){
    const rotation=new Quaternion().setFromEuler(new Euler(b.rotationX??0,b.rotationY??0,b.rotationZ??0));
    const c=world.createCollider(RAPIER.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2).setTranslation(b.position.x,b.position.y,b.position.z)
      .setRotation(rotation));ids.set(c.handle,b.id);
  }world.step();const activity=city.urban.find(d=>d.id==='citadel')!,failures:string[]=[],shape=new RAPIER.Capsule(.62,.22);
  try{
    for(const [a,b] of activity.npcs.edges){
      const start=activity.npcs.nodes[a]!,end=activity.npcs.nodes[b]!,count=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/.3));
      for(let i=0;i<=count;i++){
        const t=i/count,p={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t},hits:string[]=[];
        world.intersectionsWithShape({...p,y:p.y+.87},{x:0,y:0,z:0,w:1},shape,c=>{hits.push(ids.get(c.handle)!);return true;});
        const floor=world.castRayAndGetNormal(new RAPIER.Ray({...p,y:p.y+.15},{x:0,y:-1,z:0}),.35,true);
        if((hits.length||!floor||floor.normal.y<.94)&&failures.length<20)failures.push(`${a}→${b} ${JSON.stringify(p)} hits=${hits} floor=${floor?.timeOfImpact}`);
      }
    }expect(failures).toEqual([]);
  }finally{world.free();}
});

test('M9 rain follows upper floors and roof ownership, with frozen serializable environment',()=>{
  const world=createCityWorld('upper'),scene=new Scene(),sun=new DirectionalLight(),fill=new HemisphereLight();scene.background=new Color();
  const env=createEnvironmentPresentation(scene,sun,fill,world.course,[],world.blueprint),state=createEnvironment();setEnvironment(state,'rain','night',true);
  const root=new Scene();env.attachArea('citadel',root,world.citadel!.roofEnvelopes);env.areaActive('citadel',true);
  try{
    env.update(state,{x:150,y:50,z:-605},false);expect(env.stats().rainDrops).toBeGreaterThan(100);expect(env.stats().rainGroundBounds).toEqual({minX:-160,maxX:385,minZ:-660,maxZ:48});
    const rain=scene.getObjectByName('living.rain') as LineSegments,position=rain.geometry.getAttribute('position');
    let atTerrace=0;for(let i=0;i<env.stats().rainDrops*2;i++){
      const floor=urbanFloorAt(world.blueprint,position.getX(i),position.getZ(i));
      if(floor!==null&&floor>40){expect(position.getY(i)).toBeGreaterThan(floor-.01);atTerrace++;}
    }expect(atTerrace).toBeGreaterThan(0);
    const frozen=Array.from(position.array);env.update(state,{x:150,y:50,z:-605},false);expect(Array.from(position.array)).toEqual(frozen);
    env.detachArea('citadel');expect(env.stats().areaHooks).not.toContain('citadel');
    // Accepted Rural terrain is intentionally absent from the macro blueprint.
    // Returning downhill must keep its original cottage-terrace rain clipping.
    env.update(state,{x:-6,y:4,z:1.5},false);
    let acceptedSamples=0;
    for(let i=0;i<env.stats().rainDrops*2;i++){
      const x=position.getX(i),z=position.getZ(i);
      if(x>-10&&x<0&&z>-5&&z<2){
        expect(urbanFloorAt(world.blueprint,x,z)).toBeNull();
        expect(position.getY(i),JSON.stringify({x,z,y:position.getY(i)})).toBeGreaterThanOrEqual(4.039);acceptedSamples++;
      }
    }
    expect(acceptedSamples).toBeGreaterThan(30);
  }finally{env.dispose();}
});

test('M9 unloaded hero context hides only on Citadel activation and disposes once',()=>{
  const world=createCityWorld('upper'),state=createState(world.course),view=createCityPresentation(world.blueprint,world.acceptedCourses,world.replacedLandmarks,world.urban,world.citadel);
  try{
    view.update(state,['rural']);const hero=view.group.getObjectByName('city.overview.citadel')!;expect(hero.visible).toBe(true);
    expect(hero.children.some(o=>o instanceof Mesh)).toBe(true);const inventory=view.stats().resources;
    view.update(state,['citadel','upper-city']);expect(hero.visible).toBe(false);expect(view.stats().resources).toEqual(inventory);
  }finally{view.dispose();view.dispose();expect(view.stats().resources.geometries).toBe(0);}
});

test('M9 high-court falls land safely and unsupported falls recover in both gameplay modes',async()=>{
  const world=createCityWorld('upper'),physics=await createPhysics(world.course),state=createState(world.course);
  state.paused=false;
  try{
    for(const mode of ['third-person','first-person'] as const){
      state.camera.mode=mode;
      physics.reset(state,{x:140,y:55,z:-600});const setupResets=state.resets;
      for(let i=0;i<300;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      expect(state.player.grounded).toBe(true);expect(state.player.position.y).toBeCloseTo(50,0);expect(state.resets).toBe(setupResets);
      // Outside the accepted footprint, gravity reaches the existing recovery
      // threshold. This is a separate deliberate safety setup, not route proof.
      physics.reset(state,{x:420,y:55,z:-690});const fallResets=state.resets;
      for(let i=0;i<600;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      expect(state.resets).toBe(fallResets+1);expect(state.player.grounded).toBe(true);
      expect(Math.hypot(state.player.position.x-world.course.spawn.x,state.player.position.z-world.course.spawn.z)).toBeLessThan(.1);
      expect(state.camera.mode).toBe(mode);
    }
  }finally{physics.dispose();}
});

test('face-plane arch rotations agree between rendered Three geometry and both Rapier admission paths',async()=>{
  const box={id:'fixture.arch-stone',position:{x:0,y:3,z:0},size:{x:4,y:2,z:.6},
    rotationX:.3,rotationY:.7,rotationZ:.8,color:0xffffff,collides:true};
  const course:CourseSpec={id:'m9.arch-rotation-fixture',seed:1,spawn:{x:20,y:0,z:20},boxes:[box],surfaces:[],labels:[],bookmarks:{}};
  const geometry=new BoxGeometry(box.size.x,box.size.y,box.size.z),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material);
  mesh.position.set(0,3,0);mesh.rotation.set(box.rotationX,box.rotationY,box.rotationZ);mesh.updateMatrixWorld(true);
  try{
    for(const staged of [false,true]){
      const physics=await createPhysics({...course,boxes:staged?[]:course.boxes});
      try{
        if(staged){const admission=await physics.prepareArea('arch-fixture',course,new AbortController().signal);admission.activate();}
        for(const axis of [new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)]){
          const direction=axis.applyQuaternion(mesh.quaternion),center=mesh.position.clone();
          const origin=center.clone().addScaledVector(direction,6),target=center.clone().addScaledVector(direction,-6);
          const visibleHit=new Raycaster(origin,direction.clone().negate()).intersectObject(mesh)[0]!;
          expect(visibleHit).toBeTruthy();
          const collisionDistance=physics.cameraCast(origin,target,.0001);
          expect(Math.abs(collisionDistance+.045-visibleHit.distance),JSON.stringify({staged,axis:axis.toArray()})).toBeLessThan(.005);
        }
      }finally{physics.dispose();}
    }
  }finally{geometry.dispose();material.dispose();}
});

test('M9 bank street foundations close the observed void with shared visible and collision faces',async()=>{
  test.setTimeout(90000);const world=createCityWorld('upper'),view=createCityPresentation(world.blueprint,world.acceptedCourses,world.replacedLandmarks,world.urban,world.citadel);
  const physics=await createPhysics(world.residentCourse);
  try{
    const wall=view.group.getObjectByName('city.terrain.retaining-sides') as Mesh;
    const source=world.residentCourse.surfaces!.find(s=>s.id==='city.terrain.collision-retaining-sides')!;
    expect(Array.from(wall.geometry.getAttribute('position').array)).toEqual(Array.from(new Float32Array(source.vertices)));
    expect(Array.from(wall.geometry.index!.array)).toEqual(source.indices);
    view.group.updateMatrixWorld(true);
    // Ray reconstructed from the actual Temple bank inspection's white void.
    const origin=new Vector3(203,23.635100479125978,-350),direction=new Vector3(.46001844478405846,-.5936992378771615,-.6602304487090349);
    const hit=new Raycaster(origin,direction).intersectObject(wall)[0]!;expect(hit).toBeTruthy();expect(hit.distance).toBeLessThan(50);
    const target=origin.clone().addScaledVector(direction,60),distance=physics.cameraCast(origin,target,.0001);
    expect(Math.abs(distance+.045-hit.distance)).toBeLessThan(.01);
    const older=createCityWorld('core'),oldView=createCityPresentation(older.blueprint,older.acceptedCourses,older.replacedLandmarks,older.urban);
    try{
      // The accepted water surface itself retains exactly the same triangles.
      const before=oldView.group.getObjectByName('city.water.connected-ribbons') as Mesh,after=view.group.getObjectByName('city.water.connected-ribbons') as Mesh;
      expect(Array.from(after.geometry.getAttribute('position').array)).toEqual(Array.from(before.geometry.getAttribute('position').array));
      expect(Array.from(after.geometry.index!.array)).toEqual(Array.from(before.geometry.index!.array));
    }finally{oldView.dispose();}
  }finally{physics.dispose();view.dispose();}
});

test('decorative water-bank closure preserves submerged fall recovery in both cameras',async()=>{
  test.setTimeout(90000);const world=createCityWorld('upper'),physics=await createPhysics(world.course),state=createState(world.course);state.paused=false;
  try{
    for(const mode of ['third-person','first-person'] as const){
      state.camera.mode=mode;physics.reset(state,{x:213,y:15,z:-360});const before=state.resets;
      for(let i=0;i<600;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      expect(state.resets).toBe(before+1);expect(state.player.grounded).toBe(true);expect(state.camera.mode).toBe(mode);
    }
  }finally{physics.dispose();}
});

test('M9 road coping closes the existing clearance cut with a real shared shoulder floor',async()=>{
  test.setTimeout(90000);const world=createCityWorld('upper'),view=createCityPresentation(world.blueprint,world.acceptedCourses,world.replacedLandmarks,world.urban,world.citadel);
  const physics=await createPhysics(world.residentCourse);
  try{
    const mesh=view.group.getObjectByName('city.circulation.edge-coping') as Mesh;
    const surface=world.residentCourse.surfaces!.find(s=>s.id===mesh.name)!;
    const finished=surface.vertices.map((value,i)=>value+(i%3===1?.07:0));
    expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(Array.from(new Float32Array(finished)));
    expect(Array.from(mesh.geometry.index!.array)).toEqual(surface.indices);
    // Upper court road's level-40 outer clearance: beyond the original 2.75 m
    // half-width but inside its 2.95 m terrain cut, previously exposed as sky.
    const x=173-10/Math.hypot(40,10)*2.87,z=-508+40/Math.hypot(40,10)*2.87;
    expect(urbanFloorAt(world.blueprint,x,z)).toBeNull();
    mesh.updateMatrixWorld(true);const from=new Vector3(x,42,z),to=new Vector3(x,38,z);
    const hit=new Raycaster(from,new Vector3(0,-1,0)).intersectObject(mesh)[0]!;
    expect(hit).toBeTruthy();expect(hit.point.y).toBeCloseTo(40.04,2);
    // Collision supports the stone finish at y=39.97, with the same authored
    // triangle footprint. The 7 cm finish lift is distinct from cast clearance.
    expect(Math.abs(physics.cameraCast(from,to,.0001)+.045-hit.distance-.07)).toBeLessThan(.005);
  }finally{physics.dispose();view.dispose();}
});
