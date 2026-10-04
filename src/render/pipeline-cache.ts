import { REVISION } from 'three';
import type { Object3D } from 'three';

interface Program { usedTimes: number; code: string; stage: string; }
interface Pipeline { cacheKey: string; usedTimes: number; vertexProgram: Program; fragmentProgram: Program; }
interface RenderObject { object: Object3D; }
export interface PipelineManager {
  backend: { get(pipeline: Pipeline): { pipeline?: unknown; error?: boolean }; };
  getForRender(object: RenderObject, promises?: Promise<unknown>[] | null): Pipeline;
  _releasePipeline(pipeline: Pipeline): void;
  _releaseProgram(program: Program): void;
}

/** A bounded renderer-owned lease on r186's immutable render pipeline/program
 * records. These records contain no meshes, material bindings, textures or
 * colliders. Their extra references preserve Three's own exact cache keys;
 * area RenderObject/NodeBuilderState disposal remains unchanged. */
export function installPipelineCache(manager: PipelineManager,
  selected: WeakMap<Object3D, string>, capacity = 512) {
  if (REVISION !== '186') throw new Error('Revalidate pipeline cache for this Three revision.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 512) throw new Error('Invalid pipeline cache capacity.');
  const entries = new Map<string, { pipeline: Pipeline; area: string }>();
  const captured = new WeakMap<RenderObject, Pipeline>();
  const original = manager.getForRender;
  let disposed = false, hits = 0, misses = 0, evictions = 0, pending = 0;
  function release(pipeline: Pipeline) {
    pipeline.usedTimes--; pipeline.vertexProgram.usedTimes--; pipeline.fragmentProgram.usedTimes--;
    if (pipeline.usedTimes === 0) manager._releasePipeline(pipeline);
    if (pipeline.vertexProgram.usedTimes === 0) manager._releaseProgram(pipeline.vertexProgram);
    if (pipeline.fragmentProgram.usedTimes === 0) manager._releaseProgram(pipeline.fragmentProgram);
  }
  function retain(pipeline: Pipeline, area: string) {
    const native = manager.backend.get(pipeline);
    if (disposed || !native.pipeline || native.error) return;
    const prior = entries.get(pipeline.cacheKey);
    if (prior) {
      if (prior.pipeline !== pipeline) throw new Error('Three pipeline cache identity changed.');
      hits++; entries.delete(pipeline.cacheKey); entries.set(pipeline.cacheKey, prior); return;
    }
    misses++; pipeline.usedTimes++; pipeline.vertexProgram.usedTimes++; pipeline.fragmentProgram.usedTimes++;
    entries.set(pipeline.cacheKey, { pipeline, area });
    if (entries.size > capacity) {
      const oldest = entries.entries().next().value!;
      entries.delete(oldest[0]); release(oldest[1].pipeline); evictions++;
    }
  }
  manager.getForRender = function (object, promises) {
    const start = promises?.length ?? 0;
    const pipeline = original.call(this, object, promises);
    const area = selected.get(object.object);
    if (area && !disposed && captured.get(object) !== pipeline) {
      // Observe each actual RenderObject pipeline once. Warmup and first main
      // submission may use distinct exact keys; ordinary frames never re-pin
      // evicted active entries or churn the bounded LRU.
      captured.set(object, pipeline);
      const waits = promises?.slice(start) ?? [];
      if (waits.length) {
        pending++;
        // Wait before owning a native result. Only immutable records and the
        // plain area ID survive this await, never the RenderObject/mesh.
        promises!.push(Promise.all(waits).then(() => retain(pipeline, area)).finally(() => { pending--; }));
      } else retain(pipeline, area);
    }
    return pipeline;
  };
  return {
    snapshot() {
      const programs = new Set<Program>(), byArea: Record<string, number> = {};
      for (const { pipeline, area } of entries.values()) {
        programs.add(pipeline.vertexProgram); programs.add(pipeline.fragmentProgram);
        byArea[area] = (byArea[area] ?? 0) + 1;
      }
      return { entries: entries.size, capacity, programs: programs.size, references: entries.size,
        byArea, hits, misses, evictions, pending, disposed,
        scope: 'Immutable native pipeline/program leases; no area objects/bindings/textures; count is not VRAM bytes.' };
    },
    dispose() {
      if (disposed) return; disposed = true; manager.getForRender = original;
      for (const { pipeline } of entries.values()) release(pipeline);
      entries.clear();
    },
  };
}
