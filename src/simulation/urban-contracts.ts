import type { DistrictBuilding, DistrictStreet } from './district-layout';
import type { DistrictDressing, FacadeProfile } from './district-art';
import type { DistrictModuleId } from '../assets/district';
import type { NpcDefinition } from './npcs';
import type { Vec3, CourseSpec } from './types';
import type { CityDistrictId } from './city-contracts';

export type ProductionDistrictId = 'central-market' | 'lower-canal' | 'civic-terrace' | 'garden-terrace' | 'south-gate';
export type UrbanRecipe = 'merchant-house' | 'exchange-house' | 'corner-inn' | 'hall'
  | 'canal-house' | 'workshop-house' | 'storehouse' | 'water-guild' | 'civic-house' | 'garden-house' | 'gate-house';
export interface UrbanBuilding extends DistrictBuilding {
  recipe: UrbanRecipe;
  facade: FacadeProfile;
  bays: number;
  roofDirection: 0 | 1;
  corner: 'timber' | 'stone' | 'pilaster';
  shopfront: 'single' | 'paired' | 'wide' | 'service' | 'arcade';
  shutterOffset: number;
  cloth: number;
  hero?: boolean;
  /** Omit a service door where the accepted terrace gives it no usable apron. */
  rearEntrance?: boolean;
}
export interface UrbanStall {
  x: number; y: number; z: number; yaw: number; cloth: number;
  width: number; depth: number;
  goods: Extract<DistrictModuleId, 'goods-bread' | 'goods-pottery' | 'goods-produce' | 'goods-textiles'>;
}
export interface UrbanNpcGraph {
  nodes: Record<string, Vec3>;
  edges: [string, string][];
  definitions: NpcDefinition[];
}
export interface UrbanGarden {id:string;position:Vec3;radius:number;tree:string;scale:number;}
export interface UrbanPlant {id:string;kind:string;position:Vec3;scale:number;heading:number;}
export interface UrbanHandoff {
  id:string;neighbor:CityDistrictId;position:Vec3;inward:Vec3;width:number;approachRadius:number;
}
export interface UrbanDistrict {
  id: ProductionDistrictId;
  identity: string;
  buildings: UrbanBuilding[];
  dressing: DistrictDressing[];
  gardens?:UrbanGarden[];
  planting?:UrbanPlant[];
  plantedGround?:NonNullable<CourseSpec['surfaces']>;
  stalls: UrbanStall[];
  lamps: [number, number, number][];
  /** Additional local paths, never replacements for accepted M6.1 roads. */
  streets: DistrictStreet[];
  surfaces: NonNullable<CourseSpec['surfaces']>;
  /** Resident macro tops/roads supplied by integration; render veneers only. */
  pavingSurfaces?: NonNullable<CourseSpec['surfaces']>;
  retainingSurfaces?:NonNullable<CourseSpec['surfaces']>;
  /** Local joins outside a macro portal need their own supported handoff guard. */
  handoffs?:UrbanHandoff[];
  route: Vec3[];
  views: Record<string, { position: Vec3; yaw: number; pitch: number }>;
  eagle: { position: Vec3; target: Vec3; fov: number };
  npcs: UrbanNpcGraph;
  ambience: { market: number; workshop: number; river: number; position: Vec3 };
  assumptions: string[];
}
