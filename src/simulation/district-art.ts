import type { DistrictModuleId } from '../assets/district';
import { DISTRICT_BUILDINGS } from './district-layout';
import type { Vec3 } from './types';

/** M4.1 authored elevation choices. No seed-driven ornament or layout changes. */
export const FACADE_PROFILES = {
  cottage: { width: .88, height: 1.16, spacing: 2.9, shift: -.18, shutters: 'mixed', shop: 'small', balcony: -.65 },
  tall: { width: .90, height: 1.62, spacing: 2.8, shift: .12, shutters: 'folded', shop: 'small', balcony: .72 },
  paired: { width: .73, height: 1.24, spacing: 3.5, shift: -.12, shutters: 'mixed', shop: 'small', balcony: -.72 },
  trade: { width: 1.26, height: 1.04, spacing: 3.35, shift: .18, shutters: 'utility', shop: 'wide', balcony: 0 },
  narrow: { width: .69, height: 1.12, spacing: 3.05, shift: -.22, shutters: 'closed', shop: 'small', balcony: .58 },
  civic: { width: 1.20, height: 1.84, spacing: 3.15, shift: 0, shutters: 'none', shop: 'small', balcony: 0 },
} as const;
export type FacadeProfile = keyof typeof FACADE_PROFILES;
const profiles: readonly FacadeProfile[] = [
  'cottage','tall','trade','paired','tall','paired','civic','narrow',
  'paired','trade','tall','narrow','paired','tall',
  'narrow','trade','paired','tall','trade','cottage',
  'trade','cottage','paired','narrow','tall','trade','trade',
];
export const DISTRICT_FACADES = Object.fromEntries(DISTRICT_BUILDINGS.map((b,i) => [b.id, profiles[i]!])) as Record<string, FacadeProfile>;

export const DISTRICT_STALLS = [
  { x:84, z:-18, yaw:0, cloth:0x875239, width:1.06, depth:1, goods:'goods-bread' },
  { x:95, z:-18, yaw:0, cloth:0x496c67, width:.94, depth:1.08, goods:'goods-pottery' },
  { x:84, z:-4, yaw:Math.PI, cloth:0x87753f, width:1, depth:.94, goods:'goods-produce' },
  { x:95, z:-4, yaw:Math.PI, cloth:0x6e6659, width:1.08, depth:1, goods:'goods-textiles' },
] as const;
export const DISTRICT_LAMPS = [[69,6.5,-14.5],[98,6.5,-14.5],[96,2.6,28],[129,2.6,10]] as const;

export interface DistrictDressing {
  id: string; module: DistrictModuleId; position: Vec3; yaw: number;
  scale: [number,number,number]; tint: number;
  /** Meter bounds for solid street furniture; thin surface veneers are noncolliding. */
  collider?: Vec3;
}
const props: DistrictDressing[] = [];
const add = (id:string, module:DistrictModuleId, x:number, y:number, z:number,
  scale:[number,number,number]=[1,1,1], yaw=0, collider?:Vec3, tint=1) => {
  props.push({id:`district.dressing.${id}`,module,position:{x,y,z},scale,yaw,collider,tint});
};
// Working aprons hug the lot corners, away from central doors and eave shelters.
for (const [id,side,kind] of [
  ['bread-shop',-1,'basket'],['joinery',1,'crate'],['dyer',1,'barrel'],
  ['bookbinder',1,'crate'],['pottery',-1,'basket'],['river-store',-1,'barrel'],
  ['net-maker',1,'basket'],['weaver-home',1,'basket'],
] as const) {
  const b=DISTRICT_BUILDINGS.find(b=>b.id===`district.${id}`)!;
  const lx=side*(b.width/2-.40),lz=b.depth/2+.40;
  const x=b.position.x+Math.cos(b.yaw)*lx+Math.sin(b.yaw)*lz;
  const z=b.position.z-Math.sin(b.yaw)*lx+Math.cos(b.yaw)*lz;
  add(`${id}.work`,kind,x,b.position.y,z,[.72,.80,.72],b.yaw,
    {x:.62,y:kind==='basket'?.45:.66,z:.52});
}
// Side-wall service alcoves; the 60m weavers-passage centre remains clear.
add('alley.wash', 'barrel',58.44,4,-39.5,[.66,.76,.66],0,{x:.49,y:.63,z:.49},.88);
add('alley.basket','basket',58.45,4,-36.7,[.68,.72,.68],0,{x:.48,y:.4,z:.48});
add('alley.repair','crate',61.35,4,-38.1,[.60,.60,.55],.08,{x:.59,y:.43,z:.41},.82);
add('upper.bench','bench',83,4,-33.3,[1,1,1],0,{x:2.1,y:.84,z:.67});
add('market.bench','bench',96.6,4,-25.3,[1,1,1],0,{x:2.1,y:.84,z:.67});
for (const [i,stall] of DISTRICT_STALLS.entries()) {
  const sign=1;
  add(`market.${i}.basket`,'basket',stall.x+sign*1.95,4,stall.z+.25,[.9,.9,.9],.17,{x:.67,y:.51,z:.67});
  add(`market.${i}.stock`,'crate',stall.x+sign*2.03,4,stall.z-.65,[.84,.84,.84],-.10,{x:.82,y:.6,z:.61});
  add(`market.${i}.stack`,'crate',stall.x+sign*2.03,4.60,stall.z-.65,[.68,.68,.68],.05);
}
// Water-facing posts sit against the existing parapets, outside bridge openings.
for (const [i,x] of [57,73,86,106,117,139].entries()) for (const z of [11.84,26.16]) {
  add(`quay.${i}.${z}.mooring`,'mooring',x,.99,z,[1,1,1],0,{x:.34,y:.76,z:.34});
}
add('quay.cargo','barrel',115.2,0,26.50,[.84,.9,.84],0,{x:.63,y:.74,z:.63},.84);
add('quay.net-stock','basket',139.6,0,26.50,[1.1,.82,.9],0,{x:.78,y:.48,z:.65});
// Small loading pockets at the foot of the upper retaining wall, away from stairs.
for(const [i,x] of [69.5,83,110.5,140].entries()) {
  add(`quay.loading.${i}.stock`,'crate',x,0,1.65,[1,.9,.9],i%2?.07:-.09,{x:.98,y:.65,z:.67},.88);
  add(`quay.loading.${i}.upper`,'crate',x+.04,.65,1.65,[.77,.7,.72],.03);
  if(i%2===0)add(`quay.loading.${i}.cask`,'barrel',x+1.25,0,1.65,[.94,1,.94],0,{x:.7,y:.83,z:.7},.83);
}
export const DISTRICT_DRESSING: readonly DistrictDressing[] = props;
