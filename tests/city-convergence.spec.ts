import { expect, test } from '@playwright/test';
import { createCityBlueprint } from '../src/simulation/city-blueprint';
import { cityRetainingSurface } from '../src/simulation/city-terrain';
import type { CourseSpec } from '../src/simulation/types';

type Surface = NonNullable<CourseSpec['surfaces']>[number];
const floor=(id:string,x0:number,x1:number,z0:number,z1:number,y:number):Surface=>({
  id,color:0,vertices:[x0,y,z0,x1,y,z0,x1,y,z1,x0,y,z1],indices:[0,2,1,0,3,2],
});
test('retaining walls end at partial adjacent terraces and street support, with the same collision geometry',()=>{
  const wall=cityRetainingSurface([floor('upper',0,10,0,10,22),floor('partial-lower',10,18,0,5,12)],
    [floor('street',10.2,14,5,10,18)]);
  const east:number[][]=[];
  for(let i=0;i<wall.vertices.length;i+=12){
    const quad=wall.vertices.slice(i,i+12);
    if(quad[0]===10&&quad[3]===10&&quad[1]===22)east.push(quad);
  }
  expect(east.length).toBeGreaterThan(0);
  expect(east.flatMap(quad=>[quad[7],quad[10]])).not.toContain(-3);
  expect(east.flatMap(quad=>[quad[7],quad[10]])).toContain(12);
  expect(east.flatMap(quad=>[quad[7],quad[10]])).toContain(18);
});
test('M6.1 preserves the approved graph while narrowing urban corridors and exposing accessible intermediate levels',()=>{
  const b=createCityBlueprint();
  const edges=b.districts.flatMap(d=>d.neighbors.filter(n=>d.id<n).map(n=>`${d.id}|${n}`)).sort();
  expect(edges).toEqual([
    'river-market|rural','neighbor-shell|river-market','neighbor-shell|south-gate',
    'garden-terrace|south-gate','lower-canal|south-gate','central-market|garden-terrace',
    'garden-terrace|west-bank','central-market|west-bank','central-market|lower-canal',
    'central-market|civic-terrace','orchard-edge|west-bank','noble-quarter|orchard-edge',
    'civic-terrace|noble-quarter','civic-terrace|temple-quarter','noble-quarter|upper-city',
    'temple-quarter|upper-city','citadel|upper-city',
  ].sort());
  expect(Math.max(...b.districts.flatMap(d=>d.footprint.map(p=>p.x)))).toBeLessThanOrEqual(385);
  for(const water of b.waterways.filter(w=>/middle|upper|headwater/.test(w.id)))expect(water.width).toBeLessThanOrEqual(12);
  for(const terrace of b.terraces){
    const owner=b.districts.find(d=>d.id===terrace.district)!;
    expect(terrace.elevation).toBeGreaterThanOrEqual(owner.elevationBand[0]);
    expect(terrace.elevation).toBeLessThanOrEqual(owner.elevationBand[1]);
    const access=b.roads.find(r=>r.id===terrace.access)!;
    expect(access).toBeDefined();expect(access.districts).toContain(terrace.district);
    expect(access.points.some(p=>p.y<=terrace.elevation)&&access.points.some(p=>p.y>=terrace.elevation)).toBe(true);
  }
  expect(b.landmarks.filter(m=>/citadel.*tower/.test(m.id)).length).toBeGreaterThanOrEqual(6);
  expect(b.landmarks.filter(m=>m.id.includes('upper-support')).length).toBeGreaterThanOrEqual(3);
  expect(b.connections.filter(c=>c.id.startsWith('connection.secondary.'))).toHaveLength(4);
  const owned=b.districts.flatMap(d=>d.landmarks.map(id=>`city.landmark.${id}`)).sort();
  expect(owned).toEqual(b.landmarks.map(m=>m.id).sort());
});
