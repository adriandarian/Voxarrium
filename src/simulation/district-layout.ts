import type { Vec3 } from './types';

/** M4's bounded authored addition. Unseen street dimensions are design assumptions. */
export type BuildingArchetype = 'residential' | 'merchant' | 'workshop' | 'townhouse' | 'canal' | 'civic';
export interface DistrictBuilding {
  id: string; archetype: BuildingArchetype; position: Vec3;
  width: number; depth: number; floors: number; floorHeight: number;
  /** Local entrance faces +Z; yaw rotates the entire building and its collision proxy. */
  yaw: number; roof: 'gable' | 'hip' | 'mansard'; roofHeight: number;
  plaster: number; roofColor: number; balcony: boolean; awning: boolean;
}
const clay = [0xab5937, 0x99502f, 0xb96b41, 0x874733, 0x2f7472];
function lot(id: string, archetype: BuildingArchetype, x: number, z: number, width: number, depth: number,
  floors: number, yaw = 0, roof: DistrictBuilding['roof'] = 'gable', variant = 0, y = 4): DistrictBuilding {
  return { id: `district.${id}`, archetype, position: { x, y, z }, width, depth, floors,
    floorHeight: archetype === 'civic' ? 3.4 : 2.65, yaw, roof,
    roofHeight: archetype === 'civic' ? 4.4 : roof === 'mansard' ? 2.7 : 1.9 + width * 0.06,
    plaster: [0xdacba5, 0xe2d5b5, 0xcabc91, 0xd6c3a0, 0xcbbbaa][variant % 5]!,
    roofColor: clay[variant % clay.length]!, balcony: archetype === 'townhouse' || archetype === 'canal',
    awning: archetype === 'merchant' || archetype === 'workshop' };
}
export const DISTRICT = { id: 'm4-market-district', seed: 104729, bounds: 154,
  extent: { minX: 48, maxX: 146, minZ: -48, maxZ: 48 },
  plaza: { x: 89, y: 4, z: -12, width: 18, depth: 18 },
  bridges: [{ id: 'market', x: 96, y: 0.08, z: 19, width: 4.2, length: 14 },
    { id: 'east', x: 129, y: 0.08, z: 19, width: 3.4, length: 14 }],
  stairs: [{ id: 'market-quay', x: 96, z: 1.15, width: 3.8, count: 24, rise: 4 / 24, tread: 0.3 },
    { id: 'east-quay', x: 129, z: 1.15, width: 3.2, count: 24, rise: 4 / 24, tread: 0.3 },
    { id: 'civic', x: 130, z: -30.15, width: 3.4, count: 8, rise: 0.15, tread: -0.3 }],
} as const;

/** Individually composed lots; variants are authored, never a random-part generator. */
export const DISTRICT_BUILDINGS: readonly DistrictBuilding[] = [
  lot('weaver-home', 'residential', 55, -38, 6.2, 7.0, 2, 0, 'gable', 0),
  lot('copper-house', 'townhouse', 65, -39, 6.8, 7.6, 3, 0, 'mansard', 1),
  lot('dyer', 'workshop', 76, -38, 8.4, 7.8, 2, 0, 'hip', 4),
  lot('upper-home', 'residential', 88, -40.3, 7.2, 6.4, 2, 0.07, 'gable', 2),
  lot('archive-house', 'townhouse', 101, -38.0, 8.2, 8.2, 3, -0.04, 'hip', 3),
  lot('civic-neighbor', 'townhouse', 113, -40.1, 7.4, 8.4, 3, 0, 'mansard', 1),
  lot('bell-guild', 'civic', 130, -39, 13, 11, 3, 0, 'hip', 4, 5.2),
  lot('upper-corner', 'residential', 142, -37, 5.8, 7.6, 2, 0, 'gable', 0),
  lot('bread-shop', 'merchant', 58, -20, 7.4, 6.4, 2, 0, 'gable', 2),
  lot('joinery', 'workshop', 68, -20, 8.6, 6.8, 2, 0, 'hip', 3),
  lot('market-west', 'merchant', 78, -20, 6.2, 6.2, 3, Math.PI / 2, 'gable', 0),
  lot('tea-house', 'merchant', 104, -20, 6.6, 6.8, 2, -Math.PI / 2, 'mansard', 4),
  lot('bookbinder', 'workshop', 119, -20, 7.2, 7.2, 2, 0, 'gable', 1),
  lot('upper-east', 'townhouse', 137, -20, 9.2, 7.8, 3, 0, 'hip', 2),
  lot('rural-gate-home', 'residential', 55, -1, 6.4, 6.4, 2, Math.PI, 'hip', 1),
  lot('pottery', 'workshop', 66, -0.4, 8.2, 7.0, 1, Math.PI, 'gable', 0),
  lot('south-market', 'merchant', 77, -1, 6.2, 6.0, 2, Math.PI, 'mansard', 2),
  lot('inn', 'townhouse', 106, -1, 9.6, 7.2, 3, Math.PI, 'gable', 0),
  lot('quay-office', 'merchant', 118, -1, 7.0, 6.4, 2, Math.PI, 'hip', 1),
  lot('east-gate-home', 'residential', 140, -1, 6.6, 6.0, 2, Math.PI, 'gable', 3),
  lot('boatwright', 'workshop', 55, 38, 9.2, 8.0, 1, Math.PI, 'gable', 4, 0),
  lot('canal-home-a', 'canal', 67, 38, 7.0, 8.2, 2, Math.PI, 'gable', 0, 0),
  lot('canal-home-b', 'canal', 78, 40.0, 8.0, 7.4, 3, Math.PI + 0.065, 'mansard', 1, 0),
  lot('ferryman', 'residential', 88, 39, 6.6, 7.2, 2, Math.PI, 'hip', 2, 0),
  lot('south-resident', 'canal', 106, 37, 7.0, 7.4, 2, Math.PI, 'gable', 3, 0),
  lot('river-store', 'merchant', 117, 38, 8.8, 8.0, 2, Math.PI, 'hip', 4, 0),
  lot('net-maker', 'workshop', 138, 38, 8.6, 8.4, 1, Math.PI, 'gable', 2, 0),
];

/** Courtyard/working-yard planting, outside the protected streets. Shared trunk proxies. */
export const DISTRICT_GARDENS = [
  { x: 68, y: 4, z: -32.1, rx: 2.7, rz: 1.45, tree: 'tree-orchard-0', scale: .48 },
  { x: 93.2, y: 4, z: -23.6, rx: 2.4, rz: 1.45, tree: 'tree-hornbeam-1', scale: .51 },
  { x: 143.8, y: 4, z: -43.6, rx: 1.5, rz: 1.7, tree: 'tree-ash-0', scale: .43 },
  { x: 52, y: 4, z: -45.5, rx: 1.8, rz: 1.1, tree: '', scale: 1 },
  { x: 108.3, y: 4, z: -45.7, rx: 2.2, rz: 1.1, tree: '', scale: 1 },
  { x: 61, y: 0, z: 32.2, rx: 1.0, rz: 1.0, tree: 'tree-alder-1', scale: .52 },
  { x: 57, y: 0, z: 44.5, rx: 3.0, rz: 1.65, tree: 'tree-orchard-1', scale: .46 },
  { x: 101, y: 0, z: 44.8, rx: 2.7, rz: 1.4, tree: 'tree-orchard-1', scale: .47 },
  { x: 132.4, y: 0, z: 44.2, rx: 2.8, rz: 2.0, tree: 'tree-alder-0', scale: .59 },
] as const;

export interface DistrictStreet { id: string; width: number; points: readonly Vec3[] }
const p = (x: number, z: number, y = 4): Vec3 => ({ x, y, z });
export const DISTRICT_STREETS: readonly DistrictStreet[] = [
  { id: 'market-street', width: 4.8, points: [p(38, -10), p(52, -10), p(69, -9), p(89, -12), p(111, -11), p(145, -10)] },
  { id: 'upper-lane', width: 3.4, points: [p(52, -10), p(50, -27), p(70, -28), p(90, -28), p(112, -28), p(130, -28), p(145, -27)] },
  { id: 'market-link', width: 3.4, points: [p(89, -28), p(89, -12), p(89, -0.8), p(96, -0.8)] },
  { id: 'binders-alley', width: 2.6, points: [p(112, -28), p(112, -20), p(112, -11), p(113, -6), p(129, -6), p(129, 0)] },
  { id: 'weavers-passage', width: 2.1, points: [p(60, -28), p(60, -45), p(94, -45), p(94, -28)] },
  { id: 'quays', width: 3.4, points: [p(50, 9.9, 0), p(75, 9.9, 0), p(96, 9.9, 0), p(129, 9.9, 0), p(144, 9.9, 0)] },
  { id: 'south-quay', width: 4.2, points: [p(50, 29, 0), p(75, 29, 0), p(96, 29, 0), p(129, 29, 0), p(144, 29, 0)] },
];

/** One connected circuit, from the rural edge through every district street and both bridges. */
export const DISTRICT_ROUTE = [p(38, -10), p(52, -10), p(69, -9), p(89, -12),
  p(89, -28), p(70, -28), p(60, -28), p(60, -45), p(94, -45), p(94, -28),
  p(70, -28), p(50, -27), p(52, -10), p(89, -12), p(111, -11),
  p(112, -20), p(112, -28), p(130, -28), p(130, -33, 5.2), p(130, -28),
  p(145, -27), p(145, -10), p(129, -6), p(129, 0), p(129, 9, 0), p(129, 29, 0),
  p(96, 29, 0), p(75, 29, 0), p(50, 29, 0), p(75, 29, 0), p(96, 29, 0),
  p(96, 9, 0), p(75, 9, 0), p(50, 9, 0), p(96, 9, 0), p(96, 0), p(89, 0), p(89, -12), p(38, -10)];
