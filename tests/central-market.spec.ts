import { expect, test } from '@playwright/test';
import { createCityBlueprint, cityRoadSurfaces } from '../src/simulation/city-blueprint';
import { createCentralMarket } from '../src/simulation/central-market';
import { DISTRICT_BUILDINGS } from '../src/simulation/district-layout';
import type { Vec3 } from '../src/simulation/types';
import type { UrbanBuilding, UrbanDistrict } from '../src/simulation/urban-contracts';
import { urbanCorners, urbanFloorAt, urbanLotFits } from '../src/simulation/urban-grammar';

const blueprint = createCityBlueprint();
const before = JSON.stringify(blueprint);
const district = createCentralMarket(blueprint);
const local = { ...blueprint, terrain:[...blueprint.terrain,...district.surfaces] };
const distance = (point: Vec3,b: UrbanBuilding) => {
  const x=Math.cos(b.yaw)*(point.x-b.position.x)-Math.sin(b.yaw)*(point.z-b.position.z);
  const z=Math.sin(b.yaw)*(point.x-b.position.x)+Math.cos(b.yaw)*(point.z-b.position.z);
  return Math.hypot(Math.max(0,Math.abs(x)-b.width/2),Math.max(0,Math.abs(z)-b.depth/2));
};
function walk(a: Vec3,b: Vec3,check: (point: Vec3)=>void) {
  const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.35));
  for(let i=0;i<=count;i++) check({x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count,z:a.z+(b.z-a.z)*i/count});
}
// Query precomputed triangles: the route test should measure route geometry, not rebuild roads per sample.
const triangles = [...blueprint.terrain,...cityRoadSurfaces(blueprint.roads),...district.surfaces].flatMap(surface=>
  Array.from({length:surface.indices.length/3},(_,i)=>surface.indices.slice(i*3,i*3+3).map(index=>surface.vertices.slice(index*3,index*3+3))));
const floorCells=new Map<string,typeof triangles>();
for(const triangle of triangles) {
  const minX=Math.floor(Math.min(...triangle.map(p=>p[0]!))/16),maxX=Math.floor(Math.max(...triangle.map(p=>p[0]!))/16);
  const minZ=Math.floor(Math.min(...triangle.map(p=>p[2]!))/16),maxZ=Math.floor(Math.max(...triangle.map(p=>p[2]!))/16);
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    const key=`${x},${z}`,bucket=floorCells.get(key)??[];bucket.push(triangle);floorCells.set(key,bucket);
  }
}
function floor(point: Vec3): number | null {
  let highest:number|null=null;
  for(const triangle of floorCells.get(`${Math.floor(point.x/16)},${Math.floor(point.z/16)}`)??[]) {
    const [a,b,c]=triangle as [number[],number[],number[]];
    if(point.x<Math.min(a[0]!,b[0]!,c[0]!)-1e-6 || point.x>Math.max(a[0]!,b[0]!,c[0]!)+1e-6
      || point.z<Math.min(a[2]!,b[2]!,c[2]!)-1e-6 || point.z>Math.max(a[2]!,b[2]!,c[2]!)+1e-6) continue;
    const d=(b[2]!-c[2]!)*(a[0]!-c[0]!)+(c[0]!-b[0]!)*(a[2]!-c[2]!); if(Math.abs(d)<1e-8)continue;
    const u=((b[2]!-c[2]!)*(point.x-c[0]!)+(c[0]!-b[0]!)*(point.z-c[2]!))/d;
    const v=((c[2]!-a[2]!)*(point.x-c[0]!)+(a[0]!-c[0]!)*(point.z-c[2]!))/d;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)highest=Math.max(highest??-Infinity,u*a[1]!+v*b[1]!+(1-u-v)*c[1]!);
  }
  return highest;
}
const arcadePosts=district.buildings.flatMap(b=>b.shopfront==='arcade'?Array.from({length:b.bays},(_,bay)=>{
  const x=-b.width*.42+b.width*.84*bay/(b.bays-1),z=b.depth/2+1.65;
  return {id:b.id,x:b.position.x+Math.cos(b.yaw)*x+Math.sin(b.yaw)*z,z:b.position.z-Math.sin(b.yaw)*x+Math.cos(b.yaw)*z};
}):[]);
function clear(point: Vec3,d: UrbanDistrict,radius=.31) {
  const building=d.buildings.find(building=>distance(point,building)<=radius);
  const prop=d.dressing.find(item=>{
    if(!item.collider)return false;
    const collider=item.collider!;
    const x=Math.cos(item.yaw)*(point.x-item.position.x)-Math.sin(item.yaw)*(point.z-item.position.z);
    const z=Math.sin(item.yaw)*(point.x-item.position.x)+Math.cos(item.yaw)*(point.z-item.position.z);
    return Math.hypot(Math.max(0,Math.abs(x)-collider.x/2),Math.max(0,Math.abs(z)-collider.z/2))<=radius;
  });
  const stall=d.stalls.find(stall=>Math.hypot(Math.max(0,Math.abs(point.x-stall.x)-1.6*stall.width),
    Math.max(0,Math.abs(point.z-stall.z)-.72*stall.depth))<=radius);
  const arcade=arcadePosts.find(post=>Math.hypot(Math.max(0,Math.abs(point.x-post.x)-.135),Math.max(0,Math.abs(point.z-post.z)-.135))<=radius);
  const garden=d.gardens?.find(g=>Math.hypot(point.x-g.position.x,point.z-g.position.z)<=radius+.33*g.scale);
  expect(building?.id??prop?.id??(stall?`stall ${stall.x},${stall.z}`:undefined)??arcade?.id??garden?.id,
    `Obstacle at ${JSON.stringify(point)}`).toBeUndefined();
}

test('Central Market is deterministic serializable production content without modifying the accepted macro blueprint',async()=>{
  expect(JSON.stringify(blueprint)).toBe(before);
  expect(createCentralMarket(blueprint)).toEqual(district);
  expect(JSON.parse(JSON.stringify(district))).toEqual(district);
  expect(district.id).toBe('central-market');
  expect(district.buildings.length).toBeGreaterThanOrEqual(60);
  expect(district.buildings.length).toBeLessThanOrEqual(85);
  expect(district.buildings.length).toBeGreaterThan(DISTRICT_BUILDINGS.length*2);
  expect(new Set(district.buildings.map(b=>b.id)).size).toBe(district.buildings.length);
  expect(district.stalls.length).toBeGreaterThanOrEqual(10);
  expect(new Set(district.stalls.map(s=>s.goods)).size).toBe(4);
  await test.info().attach('central-content-facts',{contentType:'application/json',body:Buffer.from(JSON.stringify({
    buildings:district.buildings.length,heroParts:district.buildings.filter(b=>b.hero).length,stalls:district.stalls.length,
    dressing:district.dressing.length,gardens:district.gardens?.length,npcs:district.npcs.definitions.length,
    graphNodes:Object.keys(district.npcs.nodes).length,graphEdges:district.npcs.edges.length,pavingJoints:district.surfaces.filter(s=>s.id.includes('paving-joint')).length,
  }))});
});

test('every merchant footprint is fully supported, avoids protected macro roads and does not overlap another lot or retained landmark',()=>{
  for(const b of district.buildings) {
    expect(urbanLotFits(blueprint,b),b.id).toBe(true);
    for(const point of [b.position,...urbanCorners(b,.25)]) expect(urbanFloorAt(blueprint,point.x,point.z),b.id).toBeCloseTo(12,4);
    expect(b.floors,b.id).toBeGreaterThanOrEqual(2);
    for(const landmark of blueprint.landmarks.filter(l=>!l.id.includes('market-belfry'))) {
      // All retained nearby macro landmarks are axis-aligned. Keep a small actual footprint gap.
      if(landmark.position.y+landmark.size.y/2<=12 || landmark.position.y-landmark.size.y/2>=12+b.floors*b.floorHeight)continue;
      const corners=urbanCorners(b);
      const minX=Math.min(...corners.map(c=>c.x)),maxX=Math.max(...corners.map(c=>c.x));
      const minZ=Math.min(...corners.map(c=>c.z)),maxZ=Math.max(...corners.map(c=>c.z));
      expect(maxX<=landmark.position.x-landmark.size.x/2-.45 || minX>=landmark.position.x+landmark.size.x/2+.45
        || maxZ<=landmark.position.z-landmark.size.z/2-.45 || minZ>=landmark.position.z+landmark.size.z/2+.45,
      `${b.id} / ${landmark.id}`).toBe(true);
    }
  }
  for(const [index,a] of district.buildings.entries()) for(const b of district.buildings.slice(index+1)) {
    const ac=urbanCorners(a),bc=urbanCorners(b);
    expect(Math.max(...ac.map(c=>c.x))<=Math.min(...bc.map(c=>c.x))-.65
      || Math.min(...ac.map(c=>c.x))>=Math.max(...bc.map(c=>c.x))+.65
      || Math.max(...ac.map(c=>c.z))<=Math.min(...bc.map(c=>c.z))-.65
      || Math.min(...ac.map(c=>c.z))>=Math.max(...bc.map(c=>c.z))+.65,`${a.id} / ${b.id}`).toBe(true);
  }
});

test('the hall, bell tower and merchant frontage have a controlled identity distinct from the accepted River Market',()=>{
  const heroes=district.buildings.filter(b=>b.hero);
  expect(heroes.map(b=>b.id.split('.').at(-1)).sort()).toEqual(['exchange-hall','ledger-wing','market-belfry']);
  expect(heroes.find(b=>b.id.endsWith('market-belfry'))!.position).toEqual({x:158,y:12,z:-260});
  expect(heroes.find(b=>b.id.endsWith('market-belfry'))!.floors).toBe(6);
  const houses=district.buildings.filter(b=>!b.hero);
  expect(houses.filter(b=>b.floors>=3).length/houses.length).toBeGreaterThan(.9);
  expect(new Set(houses.map(b=>b.recipe))).toEqual(new Set(['merchant-house','exchange-house','corner-inn']));
  expect(new Set(houses.map(b=>b.shopfront)).size).toBeGreaterThanOrEqual(5);
  expect(new Set(houses.map(b=>b.facade)).size).toBeGreaterThanOrEqual(3);
  expect(district.dressing.some(p=>p.id.includes('drain'))).toBe(true);
  expect(district.dressing.some(p=>p.id.includes('gutter'))).toBe(true);
  expect(district.ambience.market).toBeGreaterThan(district.ambience.workshop);
  expect(district.assumptions.some(a=>a.includes('authored interpretations'))).toBe(true);
});

test('the connected market circuit and local alley centerlines clear solid buildings, market counters and street furniture',()=>{
  expect(district.route[0]).toEqual(district.route.at(-1));
  for(const path of [district.route,...district.streets.map(s=>s.points)]) for(let i=1;i<path.length;i++) {
    walk(path[i-1]!,path[i]!,point=>{
      clear(point,district);
      // Accepted road buffers leave a 0.2 m seam; a grounded capsule spans that seam.
      const support=[point,{...point,x:point.x+.22},{...point,x:point.x-.22},{...point,z:point.z+.22},{...point,z:point.z-.22}]
        .some(sample=>Math.abs((floor(sample)??-999)-12)<.05);
      expect(support,`Unsupported circuit point ${JSON.stringify(point)}`).toBe(true);
    });
  }
  for(const surface of district.surfaces) {
    for(let i=1;i<surface.vertices.length;i+=3) expect(surface.vertices[i]).toBe(12);
    const [a,b,c]=surface.indices.slice(0,3).map(index=>surface.vertices.slice(index*3,index*3+3)) as [number[],number[],number[]];
    expect((b[2]!-a[2]!)*(c[0]!-a[0]!)-(b[0]!-a[0]!)*(c[2]!-a[2]!)).toBeGreaterThan(0);
  }
  for(const view of Object.values(district.views)) clear(view.position,district,.30);
});

test('32 persistent merchant/customer/civic/traveler identities use a connected supported graph and actual exterior eave shelters',()=>{
  const {nodes,edges,definitions}=district.npcs;
  expect(definitions).toHaveLength(32);
  expect(new Set(definitions.map(n=>n.id)).size).toBe(32);
  const neighbors=new Map<string,string[]>();
  for(const [a,b] of edges) {
    expect(nodes[a],a).toBeDefined(); expect(nodes[b],b).toBeDefined();
    neighbors.set(a,[...(neighbors.get(a)??[]),b]); neighbors.set(b,[...(neighbors.get(b)??[]),a]);
    walk(nodes[a]!,nodes[b]!,point=>{clear(point,district);expect(Math.abs((floor(point)??-999)-12),`NPC ground ${a} → ${b}`).toBeLessThan(.05);});
  }
  const visited=new Set<string>(),queue=[Object.keys(nodes)[0]!];
  while(queue.length){const id=queue.shift()!;if(visited.has(id))continue;visited.add(id);queue.push(...neighbors.get(id)??[]);}
  expect(visited.size).toBe(Object.keys(nodes).length);
  for(const definition of definitions) {
    expect(definition.id.startsWith('m7.central-market.local.')).toBe(true);
    expect(definition.dialogue.length).toBeGreaterThan(20);
    for(const id of [...definition.dayRoute,...definition.duskRoute,definition.shelterNode])expect(visited.has(id),id).toBe(true);
    const shelter=nodes[definition.shelterNode]!;
    expect(district.buildings.some(b=>(b.awning||b.hero)&&distance(shelter,b)>.45&&distance(shelter,b)<.95),definition.id).toBe(true);
  }
  for(const role of ['merchant','customer','civic worker','traveler'])expect(definitions.some(n=>n.name.endsWith(role))).toBe(true);
  expect(local.terrain.length).toBe(blueprint.terrain.length+district.surfaces.length);
});
