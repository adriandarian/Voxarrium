import type { BoxSpec, CourseSpec, Vec3 } from './types';

/** M6 authoring data only: meters, serializable, no Three.js or physics objects. */
export type CityDistrictId = 'rural' | 'river-market' | 'neighbor-shell' | 'lower-canal' | 'south-gate'
  | 'garden-terrace' | 'central-market' | 'west-bank' | 'civic-terrace' | 'noble-quarter'
  | 'temple-quarter' | 'upper-city' | 'citadel' | 'orchard-edge';
export interface CityDistrict {
  id: CityDistrictId; name: string; role: string;
  footprint: { x: number; z: number }[];
  center: Vec3; elevationBand: [number, number];
  neighbors: CityDistrictId[]; entrances: string[]; waterAdjacency: string[]; landmarks: string[];
  streamingPriority: number; density: 'rural' | 'sparse' | 'medium' | 'dense' | 'monumental';
  acceptedArea?: 'rural' | 'river-market' | 'neighbor-shell';
}
export interface CityRoad {
  id: string; kind: 'primary' | 'secondary' | 'alley' | 'stairs' | 'ramp' | 'bridge';
  width: number; points: Vec3[]; districts: CityDistrictId[];
}
export interface CityWaterway {
  id: string; from: string; to: string; width: number; points: Vec3[];
  evidence: 'visible' | 'assumed-connection';
}
export interface CityConnection {
  id: string; from: CityDistrictId; to: CityDistrictId; road: string;
  /** Resident collision corridor gives preparation a safe supported handoff. */
  points: Vec3[]; width: number;
}
export interface CityCamera {
  id: string; position: Vec3; target: Vec3; fov: number;
}
export interface CityTerrace {
  id: string; district: CityDistrictId; elevation: number;
  footprint: { x: number; z: number }[]; color: number;
  /** Existing or secondary road that gives this intermediate level ordinary access. */
  access: string;
}
export interface CityBlueprint {
  id: 'm6-city-blueprint'; seed: number; districts: CityDistrict[];
  terrain: NonNullable<CourseSpec['surfaces']>; roads: CityRoad[]; waterways: CityWaterway[];
  connections: CityConnection[]; landmarks: BoxSpec[];
  massing: Record<CityDistrictId, BoxSpec[]>;
  cameras: CityCamera[]; route: Vec3[];
  assumptions: string[];
  terraces: CityTerrace[];
}
