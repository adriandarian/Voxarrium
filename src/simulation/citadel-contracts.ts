import type { BoxSpec, CourseSpec, Vec3 } from './types';

/** Immutable serializable hero placement; Three/Rapier resources stay in adapters. */
export interface CitadelSpec {
  paving?: {id:string;vertices:number[];indices:number[];color:number}[];
  assetId: 'citadel.hero';
  position: Vec3;
  course: CourseSpec;
  /** Replacement skyline at unloaded distance, owned by the resident presentation. */
  silhouettes: BoxSpec[];
  replacedLandmarks: string[];
  roofEnvelopes: { min: number[]; max: number[] }[];
  assumptions: string[];
}
