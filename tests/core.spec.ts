import {test,expect} from '@playwright/test';
import {createCityWorld,cityDemand,citySafetyGates,cityBoundaryDistance} from '../src/simulation/city-world';
import {CITY_CORE_PREPARATION_LEAD_SECONDS} from '../src/simulation/city-core';
import {createPhysics} from '../src/physics/physics';
import {createState} from '../src/simulation/state';
import {FIXED_DT,IDLE_INPUT} from '../src/simulation/types';
import type {Vec3} from '../src/simulation/types';
import {createNpcNavigation,createPopulation} from '../src/simulation/npcs';
import {createNpcResidency,npcArea,npcTierCounts,stepResidentPopulation} from '../src/simulation/npc-residency';
import {urbanCorners,urbanFloorAt} from '../src/simulation/urban-grammar';
import RAPIER from '@dimforge/rapier3d-compat';
import {createCityPresentation} from '../src/render/city-blueprint';
import {createStreamingController} from '../src/simulation/streaming';
import {areaDistance} from '../src/simulation/streaming-contracts';
import type {AreaId} from '../src/simulation/streaming-contracts';

test('M8 cold startup finishes the current ward before admitting its first selected neighbor',async()=>{
  const core=createCityWorld('core'),loads:string[]=[];let finishRural:()=>void=()=>{};
  const controller=createStreamingController(core.areas,{async load(area){
    loads.push(area.id);if(area.id==='rural')await new Promise<void>(resolve=>{finishRural=resolve;});
    return {activate(){},deactivate(){},unload(){}};
  }},{preparationLeadSeconds:CITY_CORE_PREPARATION_LEAD_SECONDS,unloadRadius:46});
  try{
    controller.update(core.course.spawn,0,{x:0,y:0,z:0},['rural','river-market']);
    for(let i=0;i<5;i++)await Promise.resolve();
    expect(loads).toEqual(['rural']);expect(controller.snapshot().pendingIds).toEqual(['rural']);
    finishRural();await controller.settled();
    // Main explicitly preloads its known first neighbor after current startup.
    controller.preload('river-market');await controller.settled();
    expect(loads).toEqual(['rural','river-market']);expect(controller.loadedIds()).toEqual(['rural','river-market']);
    expect(controller.snapshot().errors).toEqual([]);
  }finally{finishRural();controller.dispose();}
});

test('M8 stationary rural return retires a ready distant neighbor after the ordinary departure delay',async()=>{
  const core=createCityWorld('core'),unloaded:string[]=[];
  const controller=createStreamingController(core.areas,{async load(area){
    return {activate(){},deactivate(){},unload(){unloaded.push(area.id);}};
  }},{preparationLeadSeconds:CITY_CORE_PREPARATION_LEAD_SECONDS,unloadRadius:46});
  try{
    controller.update(core.course.spawn,0,{x:0,y:0,z:0},['rural','river-market']);await controller.settled();
    controller.preload('river-market');await controller.settled();
    controller.update({x:100,y:4,z:-10},.1,{x:-5.4,y:0,z:0},['river-market','rural']);
    expect(controller.loadedIds()).toEqual(['rural','river-market']);
    let demand:AreaId[]=['rural','river-market'];
    for(let i=0;i<120;i++){
      demand=cityDemand(core.areas,core.course.spawn,{x:0,y:0,z:0},demand);
      controller.update(core.course.spawn,FIXED_DT,{x:0,y:0,z:0},demand);
    }
    expect(demand).toEqual(['rural','river-market']);
    expect(controller.loadedIds()).toEqual(['rural']);expect(controller.activeIds()).toEqual(['rural']);
    expect(unloaded).toEqual(['river-market']);expect(controller.snapshot().errors).toEqual([]);
  }finally{controller.dispose();}
});

test('M8 Civic local circuit keeps cold Central preparation while distant future proxies remain resident context',async()=>{
  const core=createCityWorld('core'),civic=core.urban.find(d=>d.id==='civic-terrace')!;
  let clock=0,readyAt=0,finishCentral:()=>void=()=>{},centralRequests=0,centralCancels=0;
  const leases=new Set<string>();let maximum=0;
  const controller=createStreamingController(core.areas,{async load(area,signal){
    leases.add(area.id);maximum=Math.max(maximum,leases.size);
    try{
      if(area.id==='central-market'){
        centralRequests++;readyAt=clock+25;
        signal.addEventListener('abort',()=>{centralCancels++;},{once:true});
        await new Promise<void>(resolve=>{finishCentral=resolve;});
      }
      signal.throwIfAborted();return {activate(){},deactivate(){},unload(){leases.delete(area.id);}};
    }catch(error){leases.delete(area.id);throw error;}
  }},{preparationLeadSeconds:CITY_CORE_PREPARATION_LEAD_SECONDS,unloadRadius:46});
  let demand:AreaId[]=['civic-terrace','central-market'];
  const advance=async(position:Vec3,velocity:Vec3,dt:number)=>{
    clock+=dt;if(clock>=readyAt)finishCentral();for(let i=0;i<5;i++)await Promise.resolve();
    demand=cityDemand(core.areas,position,velocity,demand);
    controller.update(position,dt,velocity,demand);for(let i=0;i<5;i++)await Promise.resolve();
  };
  try{
    controller.update(civic.route[0]!,0,{x:0,y:0,z:0},demand);await controller.settled();
    let from=civic.route[0]!;
    for(const to of civic.route.slice(1)){
      const length=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.ceil(length),dt=length/5.4/steps;
      const velocity={x:(to.x-from.x)/length*5.4,y:0,z:(to.z-from.z)/length*5.4};
      for(let i=1;i<=steps;i++){
        const t=i/steps;await advance({x:from.x+(to.x-from.x)*t,y:22,z:from.z+(to.z-from.z)*t},velocity,dt);
        expect(demand).toEqual(['civic-terrace','central-market']);
      }
      await advance(to,{x:0,y:0,z:0},.15);from=to;
    }
    expect(centralRequests).toBe(1);expect(centralCancels).toBe(0);expect(controller.ready('central-market')).toBe(true);
    expect(controller.snapshot().errors).toEqual([]);expect(maximum).toBeLessThanOrEqual(2);
    // An actual departure toward Noble still prepares its cheap proxy before
    // entering the original boundary; the authored macro connection is intact.
    let observedProxy=false;
    for(let z=-395;z>=-426;z--){
      await advance({x:50,y:22,z},{x:0,y:0,z:-5.4},1/5.4);
      if(demand.includes('noble-quarter'))observedProxy=true;
      if(z===-424)expect(controller.ready('noble-quarter')).toBe(true);
    }
    expect(observedProxy).toBe(true);expect(maximum).toBeLessThanOrEqual(2);
  }finally{finishCentral();for(let i=0;i<5;i++)await Promise.resolve();controller.dispose();}
});

test('M8 Garden fork releases a departing quay preference and follows authored road directions before the cold safety approach',async()=>{
  const core=createCityWorld('core'),m7=createCityWorld(true);
  for(const x of [300,285,280,275,270,265,260])expect(cityDemand(core.areas,{x,y:4,z:-65},{x:-5.4,y:0,z:0})).toEqual(['south-gate','garden-terrace']);
  expect(cityDemand(core.areas,{x:255,y:4,z:-62.5},{x:-4.8,y:0,z:2.4})).toEqual(['south-gate','garden-terrace']);
  expect(cityDemand(core.areas,{x:240,y:4,z:-55},{x:0,y:0,z:0},['south-gate','garden-terrace'])).toEqual(['south-gate','garden-terrace']);
  expect(cityDemand(core.areas,{x:240,y:4,z:-55},{x:-2.4,y:0,z:4.8})).toEqual(['south-gate','neighbor-shell']);
  expect(cityDemand(core.areas,{x:260,y:4,z:-65},{x:0,y:0,z:-5.4})).toContain('lower-canal');
  expect(cityDemand(m7.areas,{x:255,y:4,z:-62.5},{x:-4.8,y:0,z:2.4})).toContain('lower-canal');
  let clock=0,requestedAt:number|null=null,readyAt:number|null=null,neededAt:number|null=null;
  const pending:{at:number;resolve:()=>void}[]=[],leases=new Set<string>();let maximum=0;
  const controller=createStreamingController(core.areas,{async load(area,signal){
    leases.add(area.id);maximum=Math.max(maximum,leases.size);
    if(area.id==='garden-terrace'){
      requestedAt=clock;await new Promise<void>(resolve=>pending.push({at:clock+5.51,resolve}));readyAt=clock;
    }
    signal.throwIfAborted();return {activate(){},deactivate(){},unload(){leases.delete(area.id);}};
  }},{preparationLeadSeconds:10,unloadRadius:46});
  try{
    controller.update({x:285,y:4,z:-65},0,{x:0,y:0,z:0},['south-gate','lower-canal']);await controller.settled();
    const route=[{x:260,y:4,z:-65},{x:240,y:4,z:-55},{x:220,y:4,z:-65}],garden=core.areas.find(a=>a.id==='garden-terrace')!;
    let previous={x:285,y:4,z:-65};let demand:AreaId[]=['south-gate','lower-canal'];
    for(const target of route){
      const length=Math.hypot(target.x-previous.x,target.z-previous.z),velocity={x:(target.x-previous.x)/length*5.4,y:0,z:(target.z-previous.z)/length*5.4};
      const count=Math.ceil(length/.27);
      for(let i=1;i<=count;i++){
        clock+=length/5.4/count;const t=i/count,position={x:previous.x+(target.x-previous.x)*t,y:4,z:previous.z+(target.z-previous.z)*t};
        for(const p of pending.filter(p=>p.at<=clock))p.resolve();await Promise.resolve();await Promise.resolve();
        demand=cityDemand(core.areas,position,velocity,demand);
        controller.update(position,length/5.4/count,velocity,demand);await Promise.resolve();await Promise.resolve();
        if(areaDistance(garden,position)<=1&&neededAt===null){neededAt=clock;expect(controller.ready('garden-terrace')).toBe(true);}
      }
      // Actual-input waypoint arrivals include short stationary readbacks.
      clock+=.15;for(const p of pending.filter(p=>p.at<=clock))p.resolve();await Promise.resolve();await Promise.resolve();
      demand=cityDemand(core.areas,target,{x:0,y:0,z:0},demand);controller.update(target,.15,{x:0,y:0,z:0},demand);
      await Promise.resolve();await Promise.resolve();
      previous=target;
    }
    expect(requestedAt).not.toBeNull();expect(readyAt).not.toBeNull();expect(neededAt).not.toBeNull();expect(readyAt!).toBeLessThan(neededAt!);
    expect(maximum).toBeLessThanOrEqual(2);expect(controller.snapshot().errors).toEqual([]);
    await test.info().attach('garden-cold-fork-readiness',{contentType:'application/json',body:Buffer.from(JSON.stringify({
      method:'Logical 5.51-second cold load over the authored fork at 5.4 m/s; unchanged 1.5-second departure timer and two-lease admission.',
      requestedAt,readyAt,neededAt,leadSeconds:neededAt!-readyAt!,maximumLeases:maximum}))});
  }finally{for(const p of pending)p.resolve();await Promise.resolve();controller.dispose();}
});

test('M8 return bridge keeps Central Market while leaving the Canal fork, including stationary road joins',()=>{
  const core=createCityWorld('core');let demand:AreaId[]=['lower-canal','central-market'];
  for(const x of [285,275,260,255,250,240,230,225]){
    demand=cityDemand(core.areas,{x,y:12,z:-225},{x:-5.4,y:0,z:0},demand);
    expect(demand).toEqual(['lower-canal','central-market']);
    expect(cityDemand(core.areas,{x,y:12,z:-225},{x:0,y:0,z:0},demand)).toEqual(demand);
  }
  expect(cityDemand(core.areas,{x:224,y:12,z:-225},{x:-5.4,y:0,z:0},demand)).toEqual(['central-market','lower-canal']);
  const cleared=cityDemand(core.areas,{x:220,y:12,z:-225},{x:-5.4,y:0,z:0},demand);
  expect(cleared[0]).toBe('central-market');expect(core.areas.find(a=>a.id==='central-market')!.neighbors).toContain(cleared[1]);
  const guardId='city.guard.connection.central-market.lower-canal.central-market';
  for(const x of [250,240,235,230,226])expect(citySafetyGates(core.blueprint,['lower-canal'],{x,y:12,z:-225},core.urban).map(g=>g.id)).toContain(guardId);
  expect(citySafetyGates(core.blueprint,['lower-canal','central-market'],{x:230,y:12,z:-225},core.urban).map(g=>g.id)).not.toContain(guardId);
});

test('M8 cold Garden preparation survives actual controller braking and fork acceleration',async()=>{
  const core=createCityWorld('core'),physics=await createPhysics(core.course),state=createState(core.course);
  state.paused=false;physics.reset(state,{x:285,y:4,z:-65});const setupResets=state.resets;
  let clock=0,requestedAt:number|null=null,readyAt:number|null=null,neededAt:number|null=null;
  const pending:{at:number;resolve:()=>void}[]=[],leases=new Set<string>();let maximum=0;
  const controller=createStreamingController(core.areas,{async load(area,signal){
    leases.add(area.id);maximum=Math.max(maximum,leases.size);
    if(area.id==='garden-terrace'){
      requestedAt=clock;await new Promise<void>(resolve=>pending.push({at:clock+5.51,resolve}));readyAt=clock;
    }
    signal.throwIfAborted();return {activate(){},deactivate(){},unload(){leases.delete(area.id);}};
  }},{preparationLeadSeconds:10,unloadRadius:46});
  let demand:AreaId[]=['south-gate','lower-canal'];const garden=core.areas.find(a=>a.id==='garden-terrace')!;
  const advance=async(forward:number,run=false)=>{
    clock+=FIXED_DT;physics.step(state,{...IDLE_INPUT,forward,run},FIXED_DT);
    for(const p of pending.filter(p=>p.at<=clock))p.resolve();await Promise.resolve();await Promise.resolve();
    demand=cityDemand(core.areas,state.player.position,state.player.velocity,demand);
    controller.update(state.player.position,FIXED_DT,state.player.velocity,demand);await Promise.resolve();await Promise.resolve();
    if(areaDistance(garden,state.player.position)<=1&&neededAt===null){neededAt=clock;expect(controller.ready('garden-terrace')).toBe(true);}
  };
  try{
    controller.update(state.player.position,0,state.player.velocity,demand);await controller.settled();
    for(const [x,z] of [[260,-65],[240,-55],[220,-65],[190,-80]]){
      let frames=0;for(;frames<2400;frames++){
        const p=state.player.position,d=Math.hypot(p.x-x!,p.z-z!);if(d<.55)break;
        state.camera.yaw=Math.atan2(p.x-x!,p.z-z!);await advance(1,d>1.8);
      }
      expect(frames).toBeLessThan(2400);for(let i=0;i<9;i++)await advance(0);
    }
    expect(state.resets).toBe(setupResets);expect(state.player.grounded).toBe(true);
    expect(requestedAt).not.toBeNull();expect(readyAt).not.toBeNull();expect(neededAt).not.toBeNull();
    expect(readyAt!).toBeLessThan(neededAt!);expect(maximum).toBeLessThanOrEqual(2);
    expect(controller.snapshot().errors).toEqual([]);
    await test.info().attach('controller-fork-readiness',{contentType:'application/json',body:Buffer.from(JSON.stringify({
      scope:'Actual Rapier/controller acceleration and braking, logical 5.51-second cold preparation, isolated supported setup; no native cadence claim.',
      requestedAt,readyAt,neededAt,leadSeconds:neededAt!-readyAt!,maximumLeases:maximum}))});
  }finally{for(const p of pending)p.resolve();await Promise.resolve();controller.dispose();physics.dispose();}
});

test('M8 local Canal return guard stops the capsule before the earlier South Gate polygon boundary',async()=>{
  const core=createCityWorld('core'),physics=await createPhysics(core.course),state=createState(core.course);
  state.paused=false;physics.reset(state,{x:262,y:4,z:-84});const resets=state.resets;
  try{
    const guards=citySafetyGates(core.blueprint,['lower-canal'],state.player.position,core.urban,true);
    const guard=guards.find(g=>g.id==='m7.guard.lower-canal.north-quay.south-gate')!;
    expect(guard.position.z).toBeCloseTo(-80.45,3);
    physics.streamingGates(['lower-canal'],state.player.position,guards);
    for(let i=0;i<180;i++){
      const p=state.player.position;state.camera.yaw=Math.atan2(p.x-260,p.z+76);
      physics.step(state,{...IDLE_INPUT,forward:1,run:true},FIXED_DT);
    }
    const gate=core.areas.find(a=>a.id==='south-gate')!;
    expect(areaDistance(gate,state.player.position)).toBeGreaterThan(0);
    expect(cityBoundaryDistance(gate,state.player.position,core.urban)).toBeLessThanOrEqual(1);
    expect(state.player.grounded).toBe(true);expect(state.resets).toBe(resets);
    physics.streamingGates(['lower-canal','south-gate'],state.player.position,
      citySafetyGates(core.blueprint,['lower-canal','south-gate'],state.player.position,core.urban,true));
    for(let i=0;i<120;i++){state.camera.yaw=Math.atan2(state.player.position.x-260,state.player.position.z+76);physics.step(state,{...IDLE_INPUT,forward:1},FIXED_DT);}
    expect(areaDistance(gate,state.player.position)).toBe(0);expect(state.resets).toBe(resets);
  }finally{physics.dispose();}
});

test('M8 established fork and north-quay return demand survive braking and a short local detour',()=>{
  const core=createCityWorld('core');
  for(const velocity of [{x:-.5,y:0,z:2.4},{x:0,y:0,z:0},{x:-2.4,y:0,z:4.8}])
    expect(cityDemand(core.areas,{x:242.2,y:4,z:-56.1},velocity,['south-gate','garden-terrace'])).toEqual(['south-gate','garden-terrace']);
  expect(cityDemand(core.areas,{x:240,y:4,z:-42},{x:0,y:0,z:5.4},['south-gate','garden-terrace'])).toEqual(['south-gate','neighbor-shell']);
  expect(cityDemand(core.areas,{x:260,y:4,z:-65},{x:-.3,y:0,z:.3},['south-gate','garden-terrace'])).toEqual(['south-gate','garden-terrace']);
  for(const [x,z] of [[264,-99],[264,-112],[264,-99],[262,-82]])
    expect(cityDemand(core.areas,{x:x!,y:4,z:z!},{x:0,y:0,z:-5.4},['lower-canal','south-gate']),JSON.stringify({x,z})).toEqual(['lower-canal','south-gate']);
  expect(cityDemand(core.areas,{x:315,y:4,z:-79},{x:0,y:0,z:5.4},['lower-canal','south-gate'])).toEqual(['south-gate','lower-canal']);
  expect(cityDemand(core.areas,{x:315,y:4,z:-65},{x:-5.4,y:0,z:0},['south-gate','lower-canal'],'lower-canal')).toEqual(['south-gate','lower-canal']);
  expect(cityDemand(core.areas,{x:315,y:4,z:-65},{x:-5.4,y:0,z:0},['south-gate','lower-canal'])).toEqual(['south-gate','garden-terrace']);
});

test('M8 whole-core controller covers measured headless cold-preparation durations',async()=>{
  test.setTimeout(180000);
  const core=createCityWorld('core'),physics=await createPhysics(core.course),state=createState(core.course);
  state.paused=false;let clock=0,startup=true,maximum=0,demand:AreaId[]|undefined,returnNeighbor:AreaId|undefined;
  // Round the failed hardware-headless circuit's observed per-ward maxima up
  // to seconds. This tests that chronology's costs, not an arbitrary uniform
  // latency across the much shorter accepted proxy corridor.
  const coldSeconds:Partial<Record<AreaId,number>>={rural:11,'river-market':11,'south-gate':12,
    'garden-terrace':15,'central-market':15,'civic-terrace':13,'lower-canal':14};
  const requests=new Map<string,{at:number;readyAt:number;position:Vec3}>();
  const history:{id:string;event:string;clock:number;position:Vec3;demand:AreaId[]|undefined}[]=[];
  const pending:{at:number;resolve:()=>void;signal:AbortSignal}[]=[],leases=new Set<string>(),needed=new Set<string>();
  const controller=createStreamingController(core.areas,{async load(area,signal){
    history.push({id:area.id,event:'request',clock,position:{...state.player.position},demand});
    signal.addEventListener('abort',()=>history.push({id:area.id,event:'cancel',clock,position:{...state.player.position},demand}),{once:true});
    leases.add(area.id);maximum=Math.max(maximum,leases.size);
    try{
      if(!startup&&area.assetIds.length)await new Promise<void>(resolve=>{
        const readyAt=clock+(coldSeconds[area.id]??0);requests.set(area.id,{at:clock,readyAt,position:{...state.player.position}});
        pending.push({at:readyAt,resolve,signal});signal.addEventListener('abort',()=>resolve(),{once:true});
      });
      signal.throwIfAborted();return {activate(){},deactivate(){},unload(){leases.delete(area.id);}};
    }catch(error){leases.delete(area.id);throw error;}
  }},{preparationLeadSeconds:CITY_CORE_PREPARATION_LEAD_SECONDS,unloadRadius:46});
  const advance=async(forward:number,run=false)=>{
    clock+=FIXED_DT;for(const p of pending.filter(p=>p.at<=clock))p.resolve();
    // Let the adapter and controller's finite microtask chain settle before the next fixed step.
    for(let i=0;i<5;i++)await Promise.resolve();
    const previous=demand?.[0];
    demand=cityDemand(core.areas,state.player.position,state.player.velocity,demand,returnNeighbor);
    if(previous&&demand[0]!==previous)returnNeighbor=demand[1]===previous?previous:undefined;
    else if(demand[1]!==returnNeighbor)returnNeighbor=undefined;
    controller.update(state.player.position,FIXED_DT,state.player.velocity,demand);
    for(const id of demand){
      const area=core.areas.find(a=>a.id===id)!;
      if(cityBoundaryDistance(area,state.player.position,core.urban)<=1){
        expect(controller.ready(id),JSON.stringify({id,clock,position:state.player.position,demand,request:requests.get(id),
          loaded:controller.loadedIds(),pending:controller.snapshot().pendingIds,counts:controller.snapshot().counts,history:history.slice(-9)})).toBe(true);
        if(core.coreIds.includes(id))needed.add(id);
      }
    }
    physics.streamingGates(controller.activeIds(),state.player.position,citySafetyGates(core.blueprint,controller.activeIds(),state.player.position,core.urban,true));
    physics.step(state,{...IDLE_INPUT,forward,run},FIXED_DT);
  };
  try{
    demand=cityDemand(core.areas,state.player.position,state.player.velocity);controller.update(state.player.position,0,state.player.velocity,demand);
    await controller.settled();controller.preload('river-market');await controller.settled();startup=false;
    for(const target of core.route.slice(1)){
      let frames=0,running=true;for(;frames<3600;frames++){
        const p=state.player.position,d=Math.hypot(p.x-target.x,p.z-target.z);if(d<.55)break;
        if(d<1.8)running=false;
        if(frames%5===0)state.camera.yaw=Math.atan2(p.x-target.x,p.z-target.z);
        await advance(1,running);
      }
      expect(frames,JSON.stringify(target)).toBeLessThan(3600);for(let i=0;i<9+(target.x===206?132:0);i++)await advance(0);
    }
    expect(state.resets).toBe(0);expect(maximum).toBeLessThanOrEqual(2);expect(controller.snapshot().errors).toEqual([]);
    expect([...needed].sort()).toEqual([...core.coreIds].sort());
    await test.info().attach('logical-core-readiness',{contentType:'application/json',body:Buffer.from(JSON.stringify({clock,maximum,
      coreIds:[...needed],coldSeconds,sourceOfCosts:'artifacts/m8/stress/clear-day-before-core-lead-time/cycle-0.json',
      scope:'Natural-spawn whole route with actual Rapier/controller, all authored collision, dynamic safety gates and rounded measured 11-15 second per-ward asset preparation. No native renderer, arbitrary-latency guarantee or cadence claim.'}))});
  }finally{for(const p of pending)p.resolve();for(let i=0;i<5;i++)await Promise.resolve();controller.dispose();physics.dispose();}
});

test('M8 core preserves authoritative topology, accepted courses and both M7 production districts',async()=>{
  const core=createCityWorld('core'),m7=createCityWorld(true);
  for(const key of ['districts','roads','terrain','waterways','connections','terraces','massing','landmarks'] as const)
    expect(core.blueprint[key]).toEqual(m7.blueprint[key]);
  expect(core.acceptedCourses).toEqual(m7.acceptedCourses);expect(core.urban.slice(0,2)).toEqual(m7.urban);
  expect(core.coreIds).toHaveLength(7);expect(core.urban).toHaveLength(5);
  const seen=new Set(['river-market']);
  for(let n=0;n<7;n++)for(const d of core.blueprint.districts.filter(d=>seen.has(d.id)))
    for(const neighbor of d.neighbors)if(core.coreIds.includes(neighbor))seen.add(neighbor);
  expect([...seen].sort()).toEqual([...core.coreIds].sort());
  expect(JSON.parse(JSON.stringify(core.urban))).toEqual(core.urban);
  for(const d of core.urban.slice(2)){
    expect(d.buildings.length,d.id).toBeGreaterThan(12);expect(d.gardens!.length,d.id).toBeGreaterThanOrEqual(2);
    const minimumArea=d.id==='civic-terrace'?3500:d.id==='garden-terrace'?3000:2200;
    expect(d.buildings.reduce((sum,b)=>sum+b.width*b.depth,0),`${d.id} occupied block area`).toBeGreaterThan(minimumArea);
    expect(d.dressing.length,d.id).toBeGreaterThan(20);expect(d.buildings.some(b=>b.hero)).toBe(true);
    expect(new Set(d.buildings.map(b=>`${b.roof}.${b.roofDirection}.${b.roofHeight}`)).size).toBeGreaterThan(8);
    expect(d.npcs.definitions.length).toBeGreaterThanOrEqual(16);
    const local={...core.blueprint,terrain:[...core.blueprint.terrain,...d.surfaces]};
    for(const b of d.buildings)for(const q of urbanCorners(b))expect(urbanFloorAt(local,q.x,q.z),b.id).toBeCloseTo(b.position.y,1);
    const graph=new Set([Object.keys(d.npcs.nodes)[0]!]);
    for(let n=0;n<Object.keys(d.npcs.nodes).length;n++)for(const [a,b] of d.npcs.edges){if(graph.has(a))graph.add(b);if(graph.has(b))graph.add(a);}
    expect(graph.size,`${d.id} NPC graph connected`).toBe(Object.keys(d.npcs.nodes).length);
  }
  await test.info().attach('core-inventory',{contentType:'application/json',body:Buffer.from(JSON.stringify(core.urban.map(d=>({id:d.id,buildings:d.buildings.length,
    footprintArea:d.buildings.reduce((sum,b)=>sum+b.width*b.depth,0),gardens:d.gardens!.length,planting:d.planting?.length??0,dressing:d.dressing.length,locals:d.npcs.definitions.length,
    entrances:core.entrances.filter(e=>d.buildings.some(b=>b.id===e.buildingId)).length,streets:d.streets.length}))))});
});

test('M8 unloaded production silhouettes keep neighborhood context, suppress active detail duplicates and dispose exactly once',()=>{
  const world=createCityWorld('core'),state=createState(world.course);
  const presentation=createCityPresentation(world.blueprint,world.acceptedCourses,world.replacedLandmarks,world.urban);
  presentation.update(state,['central-market','civic-terrace']);
  const before=presentation.stats();expect(before.overviewDistricts.sort()).toEqual(['garden-terrace','lower-canal','south-gate']);
  const groups=world.urban.map(d=>presentation.group.getObjectByName(`city.overview.${d.id}`)!);
  for(let i=0;i<10;i++)presentation.update(state,i%2?['lower-canal','south-gate']:['central-market','civic-terrace']);
  expect(presentation.stats().resources).toEqual(before.resources);
  expect(world.urban.map(d=>presentation.group.getObjectByName(`city.overview.${d.id}`)!)).toEqual(groups);
  presentation.dispose();const once=presentation.stats();presentation.dispose();const twice=presentation.stats();
  expect(twice.resources).toEqual({geometries:0,materials:0,textures:0,instanceBuffers:0});expect(twice.releasedResources).toBe(once.releasedResources);
});

for(const mode of ['third-person','first-person'] as const)test(`M8 whole-core circuit and all new entrances use supported collision in ${mode}`,async()=>{
  test.setTimeout(180000);const world=createCityWorld('core'),physics=await createPhysics(world.course),state=createState(world.course);
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
    for(const d of world.urban.slice(2))for(const entrance of world.entrances.filter(e=>d.buildings.some(b=>b.id===e.buildingId))){
      physics.reset(state,{x:entrance.position.x+Math.sin(entrance.yaw)*1.1,y:entrance.position.y,z:entrance.position.z+Math.cos(entrance.yaw)*1.1});
      const resets=state.resets;walk(entrance.position);expect(state.resets).toBe(resets);
    }
    await test.info().attach('core-collision',{contentType:'application/json',body:Buffer.from(JSON.stringify({mode,steps,route:world.route,coreIds:world.coreIds,scope:'Continuous whole-core route uses natural spawn; entrance approaches use isolated explicit setups. Ordinary Rapier/controller steps, no timing claim.'}))});
  }finally{physics.dispose();}
});

test('M8 all new NPC graph edges clear real collision and retain sheltered schedule progress across reloads',async()=>{
  test.setTimeout(120000);const world=createCityWorld('core');await RAPIER.init();
  const collision=new RAPIER.World({x:0,y:0,z:0}),ids=new Map<number,string>();let samples=0;
  for(const s of world.course.surfaces??[]){const c=collision.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(s.vertices),new Uint32Array(s.indices)));ids.set(c.handle,s.id);}
  for(const b of world.course.boxes.filter(b=>b.collides)){
    const yaw=b.rotationY??0,pitch=b.rotationX??0,sx=Math.sin(pitch/2),cx=Math.cos(pitch/2),sy=Math.sin(yaw/2),cy=Math.cos(yaw/2);
    const c=collision.createCollider(RAPIER.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2).setTranslation(b.position.x,b.position.y,b.position.z)
      .setRotation({x:sx*cy,y:cx*sy,z:sx*sy,w:cx*cy}));ids.set(c.handle,b.id);
  }collision.step();const failures:string[]=[],shape=new RAPIER.Capsule(.62,.22);
  try{
    for(const d of world.urban.slice(2))for(const [aId,bId] of d.npcs.edges){
      const a=d.npcs.nodes[aId]!,b=d.npcs.nodes[bId]!,count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.3));
      for(let i=0;i<=count;i++){
        const t=i/count,point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
        const hits:string[]=[];collision.intersectionsWithShape({...point,y:point.y+.87},{x:0,y:0,z:0,w:1},shape,c=>{hits.push(ids.get(c.handle)!);return true;});
        const floor=collision.castRayAndGetNormal(new RAPIER.Ray({...point,y:point.y+.15},{x:0,y:-1,z:0}),.35,true);
        if(hits.length||!floor||floor.normal.y<.94)if(failures.length<30)failures.push(`${aId}->${bId} ${JSON.stringify(point)} hits=${hits} floor=${floor?.timeOfImpact}`);samples++;
      }
    }
    expect(failures).toEqual([]);
  }finally{collision.free();}
  expect(samples).toBeGreaterThan(400);
  const navigation=createNpcNavigation(world.urban.map(d=>d.npcs)),population=createPopulation(true,navigation),residency=createNpcResidency();
  expect(population).toHaveLength(152);
  const player={x:110,y:22,z:-365};
  for(let cycle=0;cycle<6;cycle++){
    for(let n=0;n<180;n++)stepResidentPopulation(population,residency,FIXED_DT,{weather:'clear',timeOfDay:'day'},player,world.coreIds,world.coreIds,null,navigation);
    const before=structuredClone(population);
    for(let n=0;n<180;n++)stepResidentPopulation(population,residency,FIXED_DT,{weather:'rain',timeOfDay:'dusk'},player,[],[],null,navigation);
    for(const [i,npc] of population.entries()){
      expect(npc.id).toBe(before[i]!.id);expect(npc.position).toEqual(before[i]!.position);expect(npc.nodeId).toBe(before[i]!.nodeId);
      expect(residency.entries[npc.id]!.tier).toBe('unloaded-data');expect(residency.entries[npc.id]!.observedWeather).toBe('rain');
    }
    const copy=JSON.parse(JSON.stringify(population)),copyResidency=JSON.parse(JSON.stringify(residency));
    for(let n=0;n<120;n++){
      stepResidentPopulation(population,residency,FIXED_DT,{weather:'rain',timeOfDay:'dusk'},player,world.coreIds,world.coreIds,null,navigation);
      stepResidentPopulation(copy,copyResidency,FIXED_DT,{weather:'rain',timeOfDay:'dusk'},player,world.coreIds,world.coreIds,null,navigation);
    }expect(copy).toEqual(population);expect(copyResidency).toEqual(residency);
  }
  expect(npcTierCounts(population,residency).uniqueIds).toBe(152);
  for(const d of world.urban.slice(2))expect(population.filter(n=>npcArea(n.id)===d.id).every(n=>n.distanceTravelled>0)).toBe(true);
});
