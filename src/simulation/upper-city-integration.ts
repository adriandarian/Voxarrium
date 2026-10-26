import type { CityBlueprint, CityDistrictId } from './city-contracts';
import type { CitadelSpec } from './citadel-contracts';
import type { UrbanDistrict } from './urban-contracts';
import type { Vec3 } from './types';
import { CITY_CORE_IDS, cityCoreRoute } from './city-core';
import { CITADEL_ROUTE, CITADEL_SHELTERS } from './citadel';

export const UPPER_CITY_IDS:readonly CityDistrictId[]=[...CITY_CORE_IDS,'noble-quarter','temple-quarter','upper-city','citadel'];
/** Rounded measured native M9 costs, including the preserved idle-window
 * return. Fork urgency uses these hints without changing M8's original hints. */
export const UPPER_CITY_COLD_SECONDS:Readonly<Partial<Record<CityDistrictId,number>>>={
  rural:13,'river-market':12,'lower-canal':15,'south-gate':18,'garden-terrace':18,
  'central-market':26,'civic-terrace':17,'noble-quarter':13,'temple-quarter':16,'upper-city':16,'citadel':2,
};

/** Citadel attendants join the same serializable navigation and residency stack. */
export function citadelActivity(spec:CitadelSpec):UrbanDistrict {
  const court=CITADEL_ROUTE.filter(p=>p.y===50);
  const nodes:Record<string,Vec3>=Object.fromEntries(court.map((p,i)=>[`m9.citadel.path.${i}`,{...p,y:p.y+.012}]));
  const edges:[string,string][] = court.slice(1).map((_,i)=>[`m9.citadel.path.${i}`,`m9.citadel.path.${i+1}`]);
  const shelters=Object.entries(CITADEL_SHELTERS);
  for(const [id,p] of shelters){
    const key=`m9.citadel.shelter.${id}`;nodes[key]={...p,y:p.y+.012};
    const nearest=court.map((q,i)=>({i,d:Math.hypot(p.x-q.x,p.z-q.z)})).sort((a,b)=>a.d-b.d)[0]!;
    edges.push([`m9.citadel.path.${nearest.i}`,key]);
  }
  const dayRoute=court.map((_,i)=>`m9.citadel.path.${i}`);
  const roles=['gate keeper','court steward','mason','archivist','gardener','watch attendant'];
  return {id:'citadel',identity:'Pale fortified courts and a layered ceremonial skyline; dedicated Blender hero architecture.',
    buildings:[],dressing:[],stalls:[],lamps:[],streets:[],surfaces:[],gardens:[],
    route:CITADEL_ROUTE.map(p=>({...p})),views:spec.course.bookmarks,
    eagle:{position:{x:40,y:175,z:-490},target:{x:170,y:67,z:-620},fov:50},
    npcs:{nodes,edges,definitions:roles.map((role,i)=>({id:`m9.citadel.local.${i}`,name:`Citadel ${role}`,
      dialogue:'The forecourt joins the old city by its broad stair. The high tower is visible from the river wards.',
      rainDialogue:'The gate vault and court eaves offer shelter while the rain crosses the terrace.',
      eveningDialogue:'We keep the gate lamps lit for the last travelers from the academy bridge.',
      dayRoute,duskRoute:dayRoute.slice(0,Math.max(2,Math.ceil(dayRoute.length/2))),
      shelterNode:`m9.citadel.shelter.${shelters[i%shelters.length]![0]}`,walkSpeed:.72+i*.025,idleSeconds:5+i,initialWait:i*2,
      appearance:{height:1.65+(i%3)*.06,coat:[0x626c62,0x8d7559,0x7a5c45][i%3]!,trousers:0x504a3e,skin:0xb28e6b,hair:0x493b2e,
        hat:i%2===0,apron:role==='mason',accessory:'belt' as const,accent:0xb7a575}}))},
    ambience:{market:.14,workshop:.12,river:.12,position:{x:150,y:50,z:-605}},
    assumptions:[...spec.assumptions,'Citadel staff, ceremonial use and sheltered attendance routes are authored assumptions.']};
}

/** Insert the complete upper loop at Civic's existing supported return anchor. */
export function upperCityRoute(blueprint:CityBlueprint,urban:readonly UrbanDistrict[]):Vec3[]{
  const route=cityCoreRoute(blueprint,urban);
  const civic=urban.find(d=>d.id==='civic-terrace')!.route;
  const anchor=civic.at(-1)!;
  let insert=-1;
  for(let i=0;i<route.length;i++)if(i>20&&route[i]!.x===anchor.x&&route[i]!.z===anchor.z&&route[i]!.y===anchor.y)insert=i;
  if(insert<0)throw new Error('M9 route cannot locate accepted Civic return anchor.');
  const road=(id:string)=>blueprint.roads.find(r=>r.id===id)!.points;
  const circuit=(id:string)=>urban.find(d=>d.id===id)!.route.slice(1);
  const noble=road('court-ascent'),upper=road('upper-court-road'),ascent=road('citadel-ascent');
  const north=road('northern-high-bridge'),high=road('civic-high-bridge');
  const loop=[...noble.slice(1),...circuit('noble-quarter'),...upper.slice(1),...circuit('upper-city'),
    ...ascent.slice(1),...circuit('citadel'),...ascent.slice(0,-1).reverse(),
    ...north.slice(0,-1).reverse(),...circuit('temple-quarter'),...high.slice(0,-1).reverse()];
  return [...route.slice(0,insert+1),...loop,...route.slice(insert+1)];
}
