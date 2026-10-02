import { expect, test } from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createCameraRig } from '../src/cameras/cameras';
import { createPhysics } from '../src/physics/physics';
import { cityRoadSurfaces, createCityBlueprint } from '../src/simulation/city-blueprint';
import { createStreamingWorld } from '../src/simulation/streaming-world';
import { FIXED_DT, IDLE_INPUT, PLAYER } from '../src/simulation/types';
import type { BoxSpec, CourseSpec, GameState, Vec3 } from '../src/simulation/types';

const blueprint = createCityBlueprint();
const accepted = createStreamingWorld();
const course: CourseSpec = { ...accepted.course,id:blueprint.id,seed:blueprint.seed,bounds:750,
  boxes:[...accepted.course.boxes,...blueprint.landmarks,...Object.values(blueprint.massing).flat()],
  surfaces:[...accepted.course.surfaces!,...blueprint.terrain,...cityRoadSurfaces(blueprint.roads)] };
const ids = ['rural','river-market','neighbor-shell','lower-canal','south-gate','garden-terrace','central-market',
  'west-bank','civic-terrace','noble-quarter','temple-quarter','upper-city','citadel','orchard-edge'];
const stateFor = (mode:'third-person'|'first-person'):GameState => ({sceneId:course.id,seed:course.seed,tick:0,elapsed:0,paused:false,resets:0,
  environment:null,population:[],interaction:null,player:{position:{...course.spawn},velocity:{x:0,y:0,z:0},grounded:false,heading:0},
  camera:{mode,yaw:0,pitch:-0.1,debugPosition:{x:0,y:25,z:30}}});

function segmentTouchesBox(a:Vec3,b:Vec3,box:BoxSpec,buffer:number):boolean {
  let lo=0,hi=1;
  for (const axis of ['x','z'] as const) {
    const radius=box.size[axis]/2+buffer, min=box.position[axis]-radius,max=box.position[axis]+radius;
    const delta=b[axis]-a[axis];
    if (Math.abs(delta)<1e-9) { if (a[axis]<min||a[axis]>max) return false; }
    else {const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}
  }
  return true;
}

test('city is stable serializable meter data with preserved accepted areas and connected reciprocal topology',async()=>{
  expect(JSON.parse(JSON.stringify(blueprint))).toEqual(createCityBlueprint());
  expect(blueprint.districts.map(item=>item.id).sort()).toEqual([...ids].sort());
  expect(Object.keys(blueprint.massing).sort()).toEqual([...ids].sort());
  const reached=new Set<string>(['rural']),queue=['rural'];
  while(queue.length){const next=queue.shift()!;const district=blueprint.districts.find(item=>item.id===next)!;for(const neighbor of district.neighbors){
    const other=blueprint.districts.find(item=>item.id===neighbor)!;expect(other.neighbors,district.id).toContain(district.id);
    if(!reached.has(neighbor)){reached.add(neighbor);queue.push(neighbor);}
  }}
  expect([...reached].sort()).toEqual([...ids].sort());
  for(const connection of blueprint.connections){
    const road=blueprint.roads.find(item=>item.id===connection.road)!;expect(road,connection.id).toBeDefined();
    expect(road.districts).toEqual([connection.from,connection.to]);expect(road.points).toEqual(connection.points);
    for(const districtId of [connection.from,connection.to])expect(blueprint.districts.find(item=>item.id===districtId)!.entrances).toContain(connection.id);
  }
  for(const area of accepted.areas){const district=blueprint.districts.find(item=>item.id===area.id)!;
    expect(district.acceptedArea).toBe(area.id);
    expect(Math.min(...district.footprint.map(point=>point.x))).toBe(area.bounds.minX);
    expect(Math.max(...district.footprint.map(point=>point.x))).toBe(area.bounds.maxX);
    expect(Math.min(...district.footprint.map(point=>point.z))).toBe(area.bounds.minZ);
    expect(Math.max(...district.footprint.map(point=>point.z))).toBe(area.bounds.maxZ);
  }
  expect(blueprint.route.slice(0,10)).toEqual(accepted.route.slice(0,10).map(point=>({...point,y:4})));
  expect(blueprint.terrain.every(item=>item.vertices.every(Number.isFinite))).toBe(true);
  expect(blueprint.terrain).toHaveLength(11+blueprint.terraces.length);
  const surfaces=[...blueprint.terrain,...cityRoadSurfaces(blueprint.roads)];
  expect(new Set(surfaces.map(item=>item.id)).size).toBe(surfaces.length);
  expect(surfaces.every(item=>item.indices.every(index=>index>=0&&index<item.vertices.length/3))).toBe(true);
  expect(blueprint.cameras.find(item=>item.id==='master-eagle')!.position.x).toBeLessThan(0);
  expect(blueprint.cameras.find(item=>item.id==='master-eagle')!.position.z).toBeGreaterThan(0);
  expect(blueprint.landmarks.length).toBeGreaterThanOrEqual(20);
  expect(Object.values(blueprint.massing).flat().filter(item=>item.collides).length).toBeGreaterThanOrEqual(60);
  expect(Object.values(blueprint.massing).flat().filter(item=>item.collides).length).toBeLessThanOrEqual(140);
  await test.info().attach('city-topology',{contentType:'application/json',body:Buffer.from(JSON.stringify({
    districts:blueprint.districts.map(item=>({id:item.id,neighbors:item.neighbors,elevation:item.elevationBand,
      massingBodies:blueprint.massing[item.id].filter(box=>box.collides).length})),
    groupedTerrainProxies:blueprint.terrain.length,terrainTriangles:blueprint.terrain.reduce((count,item)=>count+item.indices.length/3,0),roadCount:blueprint.roads.length,connections:blueprint.connections.length,
    waterwayCount:blueprint.waterways.length,landmarkCount:blueprint.landmarks.length,
  },null,2))});
});

test('water endpoint graph continues the accepted datum and roads meet width, slope and clearance limits',()=>{
  for(let i=1;i<blueprint.waterways.length;i++){
    const previous=blueprint.waterways[i-1]!,current=blueprint.waterways[i]!;
    expect(previous.to).toBe(current.from);expect(previous.points.at(-1)).toEqual(current.points[0]);
  }
  for(const water of blueprint.waterways)for(const point of water.points)expect(point.y).toBe(-1.16);
  const first=blueprint.waterways[0]!;expect(first.points[0]).toEqual({x:-48,y:-1.16,z:19});
  expect(first.points.at(-1)).toEqual({x:146,y:-1.16,z:19});
  const boxes=[...blueprint.landmarks,...Object.values(blueprint.massing).flat().filter(item=>item.collides)];
  const obstruction:string[]=[];
  for(const road of blueprint.roads){
    if(road.id.startsWith('accepted.'))continue;
    expect(road.width,road.id).toBeGreaterThanOrEqual(road.kind==='alley'?2.4:road.kind==='secondary'||road.kind==='stairs'?3:4);
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1]!,b=road.points[i]!;
      expect(Math.abs(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z),road.id).toBeLessThanOrEqual(0.2);
      for(const box of boxes)if(segmentTouchesBox(a,b,box,road.width/2+0.5))obstruction.push(`${road.id}.${i}: ${box.id}`);
    }
  }
  expect(obstruction).toEqual([]);
  for(const deck of cityRoadSurfaces(blueprint.roads))for(let i=0;i<deck.indices.length;i+=3) {
    const a=deck.indices[i]!*3,b=deck.indices[i+1]!*3,c=deck.indices[i+2]!*3,v=deck.vertices;
    const ux=v[b]!-v[a]!,uy=v[b+1]!-v[a+1]!,uz=v[b+2]!-v[a+2]!;
    const vx=v[c]!-v[a]!,vy=v[c+1]!-v[a+1]!,vz=v[c+2]!-v[a+2]!;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    if(Math.abs(ny)>.001)expect(Math.hypot(nx,nz)/Math.abs(ny),deck.id).toBeLessThanOrEqual(.20001);
  }
});

test('terrain cuts leave every new road and water centerline unobstructed',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0});
  for(const item of blueprint.terrain)world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(item.vertices),new Uint32Array(item.indices)));
  world.step();
  const failures:string[]=[];let samples=0;
  try{for(const feature of [...blueprint.roads.filter(item=>!item.id.startsWith('accepted.')),...blueprint.waterways]){
    for(let i=1;i<feature.points.length;i++){
      const a=feature.points[i-1]!,b=feature.points[i]!,count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2);
      for(let j=0;j<=count;j++){const t=j/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        if(world.castRay(new RAPIER.Ray({x,y:110,z},{x:0,y:-1,z:0}),120,true))failures.push(`${feature.id}.${i}.${j}`);samples++;
      }
    }
  }expect(samples).toBeGreaterThan(1500);expect(failures.slice(0,20),`${failures.length} terrain corridor hits`).toEqual([]);
    const unsupported:string[]=[];
    const supported=[...Object.values(blueprint.massing).flat().filter(item=>item.collides),
      ...blueprint.landmarks.filter(item=>!(/wall|buttress|embedded/.test(item.id)))];
    for(const body of supported){
      for(const [dx,dz] of [[0,0],[-0.45,-0.45],[-0.45,0.45],[0.45,-0.45],[0.45,0.45]]){
        const x=body.position.x+body.size.x*dx!,z=body.position.z+body.size.z*dz!;
        const hit=world.castRay(new RAPIER.Ray({x,y:110,z},{x:0,y:-1,z:0}),120,true);
        if(!hit||Math.abs(110-hit.timeOfImpact-(body.position.y-body.size.y/2))>0.03)unsupported.push(`${body.id}: ${dx},${dz}`);
      }
    }
    expect(unsupported.slice(0,20),`${unsupported.length} unsupported mass corners`).toEqual([]);
  }finally{world.free();}
});

for(const mode of ['third-person','first-person'] as const)test(`continuous city route reaches the citadel in ${mode} on real Rapier terrain and roads`,async()=>{
  test.setTimeout(120_000);
  const physics=await createPhysics(course),state=stateFor(mode),rig=createCameraRig(state,physics,blueprint);
  for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
  const resets=state.resets;let steps=0,maximumStep=0,maximumHeight=state.player.position.y;
  const reached:{expected:Vec3;actual:Vec3}[]=[];
  try{for(let waypoint=1;waypoint<blueprint.route.length;waypoint++){
    const target=blueprint.route[waypoint]!,start={...state.player.position};
    const frames=Math.ceil((Math.hypot(target.x-start.x,target.z-start.z)/PLAYER.runSpeed+4)/FIXED_DT);
    for(let frame=0;frame<frames;frame++){
      const previous={...state.player.position},dx=target.x-previous.x,dz=target.z-previous.z;
      const distance=Math.hypot(dx,dz);
      if(distance<0.04 && Math.hypot(state.player.velocity.x,state.player.velocity.z)<0.08)break;
      state.camera.yaw=Math.atan2(-dx,-dz);
      physics.step(state,{...IDLE_INPUT,forward:distance<0.6?Math.min(1,distance*2):1,run:distance>1.4},FIXED_DT);
      maximumStep=Math.max(maximumStep,Math.hypot(state.player.position.x-previous.x,state.player.position.y-previous.y,state.player.position.z-previous.z));
      maximumHeight=Math.max(maximumHeight,state.player.position.y);steps++;
      if(steps%12===0){rig.update(12*FIXED_DT,1.6);expect([rig.camera.position.x,rig.camera.position.y,rig.camera.position.z].every(Number.isFinite)).toBe(true);}
    }
    for(let frame=0;frame<24;frame++)physics.step(state,IDLE_INPUT,FIXED_DT);
    const context=`waypoint ${waypoint}: ${JSON.stringify(target)} actual ${JSON.stringify(state.player.position)}`;
    expect(Math.hypot(state.player.position.x-target.x,state.player.position.z-target.z),context).toBeLessThan(0.16);
    expect(Math.abs(state.player.position.y-target.y),context).toBeLessThan(0.10);
    expect(state.player.grounded,context).toBe(true);expect(state.resets,context).toBe(resets);
    reached.push({expected:{...target},actual:{...state.player.position}});
  }expect(steps).toBeGreaterThan(10_000);expect(maximumHeight).toBeGreaterThan(49.9);expect(maximumStep).toBeLessThan(0.42);
    await test.info().attach(`city-route-${mode}`,{contentType:'application/json',body:Buffer.from(JSON.stringify({mode,steps,reached,maximumStep,maximumHeight,jumps:0,teleports:0,resetsAfterStartup:state.resets-resets},null,2))});
  }finally{rig.dispose();physics.dispose();}
});
