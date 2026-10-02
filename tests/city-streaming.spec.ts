import { expect, test } from '@playwright/test';
import { createCityWorld, cityDemand, citySafetyGates } from '../src/simulation/city-world';
import { cityBridgeSpans } from '../src/simulation/city-navigation';
import { createStreamingWorld } from '../src/simulation/streaming-world';
import { createStreamingController } from '../src/simulation/streaming';
import { areaDistance } from '../src/simulation/streaming-contracts';
import type { Vec3 } from '../src/simulation/types';
import { FIXED_DT, IDLE_INPUT } from '../src/simulation/types';
import { createState } from '../src/simulation/state';
import { createPhysics } from '../src/physics/physics';
import { createCameraRig } from '../src/cameras/cameras';

test('city anchors accepted courses byte-for-data and uses polygonal district distance', () => {
  const city = createCityWorld(), accepted = createStreamingWorld();
  for (const area of accepted.areas) expect(city.areas.find(candidate => candidate.id === area.id)!.course).toEqual(area.course);
  expect(city.course.spawn).toEqual(accepted.course.spawn);
  const triangle = { ...city.areas[0]!, footprint: [{x:0,z:0},{x:10,z:0},{x:0,z:10}] };
  expect(areaDistance(triangle,{x:1,y:0,z:1})).toBe(0);
  expect(areaDistance(triangle,{x:9,y:0,z:9})).toBeCloseTo(Math.sqrt(32));
  expect(city.areas.flatMap(area => area.npcIds)).toHaveLength(42);
  expect(city.areas.filter(area => area.assetIds.length)).toHaveLength(2);
});

test('city lifecycle maintains two leases along the route and returns to accepted rural state', async () => {
  const city = createCityWorld();
  const leased = new Set<string>(), active = new Set<string>();
  let maximum = 0;
  const controller = createStreamingController(city.areas, { async load(area, signal, progress) {
    progress('preparing'); signal.throwIfAborted(); leased.add(area.id);
    maximum = Math.max(maximum, leased.size); progress('warming');
    return { activate() { active.add(area.id); }, deactivate() { active.delete(area.id); }, unload() { active.delete(area.id); leased.delete(area.id); } };
  } }, { preparationLeadSeconds:10, unloadRadius:46 });
  const route = [...city.route, ...city.route.slice(0,-1).reverse()];
  let previous = route[0]!;
  for (const target of route) {
    const length = Math.hypot(target.x - previous.x, target.z - previous.z);
    const count = Math.max(1, Math.ceil(length / 2));
    for (let index = 0; index <= count; index++) {
      const t = index / count;
      const position: Vec3 = {x:previous.x+(target.x-previous.x)*t,y:previous.y+(target.y-previous.y)*t,z:previous.z+(target.z-previous.z)*t};
      const velocity = {x:length ? (target.x-previous.x)/length*5.4 : 0,y:0,z:length ? (target.z-previous.z)/length*5.4 : 0};
      controller.update(position,.4,velocity,cityDemand(city.areas,position,velocity));
      await controller.settled();
      expect(controller.loadedIds().length + controller.snapshot().pendingIds.length + controller.snapshot().retiringIds.length).toBeLessThanOrEqual(2);
      expect([...active].sort()).toEqual(controller.activeIds().sort());
    }
    previous = target;
  }
  for (let index=0;index<10;index++) controller.update(previous,.2,{x:0,y:0,z:0},cityDemand(city.areas,previous,{x:0,y:0,z:0}));
  await controller.settled();
  expect(controller.activeIds()).toContain('rural');
  expect(controller.snapshot().errors).toEqual([]); expect(maximum).toBeLessThanOrEqual(2);
  controller.dispose(); expect(leased.size).toBe(0); expect(active.size).toBe(0);
});

test('city rejects broken adjacency and installs supported handoff guards only for unavailable destinations', () => {
  const city = createCityWorld();
  const adapter = { async load() { return {activate(){},deactivate(){},unload(){}}; } };
  const broken = city.areas.map((area,index) => index===0 ? {...area,neighbors:['citadel' as const]} : area);
  expect(() => createStreamingController(broken,adapter)).toThrow('reciprocal');
  const disconnected = city.areas.map(area=>({...area,neighbors:[]}));
  expect(() => createStreamingController(disconnected,adapter)).toThrow('connected');
  const gates=citySafetyGates(city.blueprint,[],city.course.spawn);
  expect(gates.length).toBe(city.blueprint.connections.length);
  expect(gates.every(gate=>gate.collides && gate.visible===false && gate.size.x>=3.4)).toBe(true);
  expect(citySafetyGates(city.blueprint,city.areas.map(area=>area.id),city.course.spawn)).toEqual([]);
  for(const district of city.blueprint.districts) {
    const demand=cityDemand(city.areas,district.center,{x:0,y:0,z:-5.4});
    expect(demand).toHaveLength(2);
    expect(city.areas.find(area=>area.id===demand[0])!.neighbors).toContain(demand[1]);
  }
});

test('city graph departure releases a nearby outgoing lease after a continuous delay and preserves capsule clearance', async()=>{
  const city=createCityWorld();
  const footprint=[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}];
  const areas=city.areas.map(area=>({...area,footprint}));
  const controller=createStreamingController(areas,{async load(){return {activate(){},deactivate(){},unload(){}};}},
    {preparationLeadSeconds:10,unloadRadius:46});
  const position={x:5,y:4,z:5},velocity={x:0,y:0,z:0};
  controller.update(position,0,velocity,['rural','river-market']);await controller.settled();
  expect(controller.loadedIds()).toEqual(['rural','river-market']);
  controller.update(position,.75,velocity,['river-market','neighbor-shell']);
  expect(controller.loadedIds()).toEqual(['rural','river-market']);
  expect(controller.activeIds()).toEqual(['river-market']);
  controller.update(position,.5,velocity,['rural','river-market']);
  expect(controller.snapshot().areas.find(area=>area.id==='rural')!.outsideSeconds).toBe(0);
  controller.update(position,1,velocity,['river-market','neighbor-shell']);
  controller.update(position,.49,velocity,['river-market','neighbor-shell']);
  expect(controller.loadedIds()).toContain('rural');
  controller.update(position,.02,velocity,['river-market','neighbor-shell']);await controller.settled();
  expect(controller.loadedIds()).toEqual(['river-market','neighbor-shell']);
  expect(controller.snapshot().errors).toEqual([]);controller.dispose();
  expect(cityDemand(city.areas,{x:146.1,y:4,z:-10},{x:5.4,y:0,z:0})).toEqual(['neighbor-shell','river-market']);
  expect(cityDemand(city.areas,{x:149,y:4,z:-10},{x:5.4,y:0,z:0})).toEqual(['neighbor-shell','south-gate']);
  expect(city.residentCourse.surfaces!.length).toBeLessThan(700);
  expect(city.residentCourse.surfaces!.some(surface=>surface.id==='city.terrain.collision-retaining-sides')).toBe(true);
  expect(city.residentCourse.boxes.filter(box=>box.id.startsWith('city.bridge.rail.'))).toHaveLength(cityBridgeSpans(city.blueprint).length*2);
});

for(const mode of ['third-person','first-person'] as const)test(`every city connection and secondary lane traverses real retaining and rail collision in ${mode}`,async()=>{
  test.setTimeout(120_000);
  const city=createCityWorld(),physics=await createPhysics(city.course),state=createState(city.course),rig=createCameraRig(state,physics,city.blueprint);
  const arrivals=[];
  try {
    state.camera.mode=mode;
    const paths=[...city.blueprint.connections,...city.blueprint.roads.filter(road=>!road.id.startsWith('accepted.')&&!city.blueprint.connections.some(connection=>connection.road===road.id)).map(road=>({id:road.id,road:road.id,points:road.points}))];
    for(const connection of paths) {
      physics.reset(state,{...connection.points[0]!,y:connection.points[0]!.y+.04});
      for(let frame=0;frame<24;frame++)physics.step(state,IDLE_INPUT,FIXED_DT);
      const resets=state.resets;
      for(const target of connection.points.slice(1)) {
        let reached=false;
        for(let frame=0;frame<9000;frame++) {
          const p=state.player.position,dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz);
          if(distance<.05){for(let brake=0;brake<24;brake++)physics.step(state,IDLE_INPUT,FIXED_DT);reached=true;break;}
          state.camera.yaw=Math.atan2(-dx,-dz);
          physics.step(state,{...IDLE_INPUT,forward:distance<.6?Math.min(1,distance*2):1,run:distance>1.4},FIXED_DT);
        }
        expect(reached,`${connection.road}: ${JSON.stringify(target)} / ${JSON.stringify(state.player.position)}`).toBe(true);
        expect(state.resets,connection.road).toBe(resets);expect(state.player.grounded,connection.road).toBe(true);
        expect(Math.abs(state.player.position.y-target.y),connection.road).toBeLessThan(.12);
        rig.update(0,1.6);expect(rig.camera.position.toArray().every(Number.isFinite)).toBe(true);
      }
      arrivals.push({connection:connection.id,position:{...state.player.position}});
    }
    state.camera.mode='eagle-eye';rig.setDebugCamera(city.blueprint.cameras[0]!.id);rig.update(0,.6);
    const pose=rig.camera.position.toArray();rig.update(0,.6);expect(rig.camera.position.toArray()).toEqual(pose);
    expect(rig.camera.near).toBe(2);expect(rig.camera.far).toBe(2200);
    await test.info().attach('all-city-connections.json',{contentType:'application/json',body:JSON.stringify({arrivals,setupResets:paths.length,mode,noRecoveryDuringLegs:true})});
  }finally{rig.dispose();physics.dispose();}
});
