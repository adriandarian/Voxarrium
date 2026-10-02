import type { CourseSpec, Vec3 } from './types';
import type { CityDistrictId } from './city-contracts';

/** M5 is exactly three authored areas; one area is one lifecycle chunk. */
export type AreaId = CityDistrictId;
export interface WorldArea {
  id: AreaId;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  course: CourseSpec;
  assetIds: readonly string[];
  npcIds: readonly string[];
  /** M6 authored polygons and adjacency; M5 retains its exact rectangular proof. */
  footprint?: readonly { x: number; z: number }[];
  neighbors?: readonly AreaId[];
  streamingPriority?: number;
}
/** Adapter owns render resources, physics proxies and environment hooks together.
 * load must prepare off-scene resources; activate installs collision before
 * showing the destination, deactivate hides it, unload removes and disposes it.
 * Every late or obsolete load must be released even when a transport ignores abort.
 */
export interface AreaHandle {
  activate(): void;
  deactivate(): void;
  unload(): void;
}
export interface StreamingAdapter {
  load(area: WorldArea, signal: AbortSignal, progress: (phase: PreparationPhase) => void): Promise<AreaHandle>;
}
export type PreparationPhase = 'preparing' | 'warming';
export interface StreamingPolicy {
  preloadRadius: number;
  deactivateRadius: number;
  unloadRadius: number;
  unloadDelaySeconds: number;
  /** Velocity lookahead for expensive authored areas, without widening residency. */
  preparationLeadSeconds: number;
}
export const STREAMING_POLICY: StreamingPolicy = {
  preloadRadius: 36, deactivateRadius: 44, unloadRadius: 52, unloadDelaySeconds: 1.5, preparationLeadSeconds: 0,
};
export function areaDistance(area: WorldArea, position: Vec3): number {
  const polygon = area.footprint;
  if (polygon && polygon.length >= 3) {
    let inside = false, distance = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j]!, b = polygon[i]!;
      if ((a.z > position.z) !== (b.z > position.z) &&
        position.x < (b.x - a.x) * (position.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = dx * dx + dz * dz;
      const t = length ? Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / length)) : 0;
      distance = Math.min(distance, Math.hypot(position.x - a.x - t * dx, position.z - a.z - t * dz));
    }
    return inside ? 0 : distance;
  }
  const b = area.bounds;
  return Math.hypot(Math.max(b.minX - position.x, 0, position.x - b.maxX),
    Math.max(b.minZ - position.z, 0, position.z - b.maxZ));
}
