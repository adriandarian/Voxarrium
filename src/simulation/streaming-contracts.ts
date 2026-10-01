import type { CourseSpec, Vec3 } from './types';

/** M5 is exactly three authored areas; one area is one lifecycle chunk. */
export type AreaId = 'rural' | 'river-market' | 'neighbor-shell';
export interface WorldArea {
  id: AreaId;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  course: CourseSpec;
  assetIds: readonly string[];
  npcIds: readonly string[];
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
  const b = area.bounds;
  return Math.hypot(Math.max(b.minX - position.x, 0, position.x - b.maxX),
    Math.max(b.minZ - position.z, 0, position.z - b.maxZ));
}
