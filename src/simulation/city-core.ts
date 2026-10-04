import type { CityBlueprint, CityDistrictId } from './city-contracts';
import type { UrbanDistrict } from './urban-contracts';
import type { Vec3 } from './types';

export const CITY_CORE_IDS:readonly CityDistrictId[]=['river-market','neighbor-shell','south-gate','garden-terrace','central-market','lower-canal','civic-terrace'];
/** Prediction horizon; measured native preparation can exceed the cost hints. */
export const CITY_CORE_PREPARATION_LEAD_SECONDS=20;
/** Future resident proxies do not need a production ward's long prediction. */
export const CITY_CORE_PROXY_APPROACH_METERS=20;
/** Rounded observed headless cold costs; hints for fork urgency, not guarantees. */
export const CITY_CORE_COLD_SECONDS:Readonly<Partial<Record<CityDistrictId,number>>>={rural:11,'river-market':11,
  'south-gate':12,'garden-terrace':15,'central-market':15,'civic-terrace':13,'lower-canal':14};
/** One continuous circuit from the natural rural spawn, through all seven core wards and back. */
export function cityCoreRoute(blueprint:CityBlueprint,urban:readonly UrbanDistrict[]):Vec3[]{
  const road=(id:string)=>blueprint.roads.find(r=>r.id===id)!.points;
  const circuit=(id:string)=>urban.find(d=>d.id===id)!.route.slice(1);
  const outward=blueprint.route.slice(0,blueprint.route.findIndex(p=>p.x===110&&p.z===-235)+1);
  const ascent=road('civic-ascent'),bridge=road('exchange-river-bridge');
  return [...outward.slice(0,outward.findIndex(p=>p.x===240&&p.z===-55)+1),...circuit('south-gate'),
    ...road('garden-ascent').slice(1),...circuit('garden-terrace'),...road('exchange-ascent').slice(1),
    ...ascent.slice(1),...circuit('civic-terrace'),...ascent.slice(0,-1).reverse(),
    ...bridge.slice(1),...urban.find(d=>d.id==='lower-canal')!.route.slice(1,9),
    ...urban.find(d=>d.id==='lower-canal')!.route.slice(1,8).reverse(),bridge.at(-1)!,
    ...bridge.slice(0,-1).reverse(),...outward.slice(0,-1).reverse(),{x:-6,y:4,z:1.5}];
}
