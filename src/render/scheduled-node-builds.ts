import { REVISION } from 'three';
import type { Object3D } from 'three';
import type { PreparationScheduler } from './preparation-scheduler';

export interface ScheduledNodeBuilder {
  object: Object3D | null;
  build(): unknown;
  buildAsync(): Promise<unknown>;
}
export interface ScheduledNodeBackend {
  createNodeBuilder(...args: unknown[]): ScheduledNodeBuilder;
}

/** r186's ordinary build() runs the same complete stages as buildAsync().
 * Selected objects use one measured per-object job instead of nine inner
 * stage yields. compileAsync still processes objects sequentially, yields
 * between them and awaits each native pipeline. No shader stage is omitted.
 * Schedulers must be nonaborting: Three treats builder errors as shader
 * failures. Cancellation remains at the settled compile progress callback. */
export function installScheduledNodeBuilds(backend: ScheduledNodeBackend,
  selected: WeakMap<Object3D, () => PreparationScheduler>): () => void {
  if (REVISION !== '186') throw new Error('Revalidate scheduled node builds for this Three revision.');
  const original = backend.createNodeBuilder;
  backend.createNodeBuilder = function (...args) {
    const builder = original.apply(this, args);
    const createScheduler = builder.object ? selected.get(builder.object) : undefined;
    if (createScheduler) {
      if (typeof builder.build !== 'function' || typeof builder.buildAsync !== 'function') {
        throw new Error('Three r186 node build contract changed.');
      }
      const originalAsync = builder.buildAsync;
      builder.buildAsync = async function () {
        // Restore immediately; neither the completed builder nor another
        // phase retains the capture scheduler through this wrapper.
        this.buildAsync = originalAsync;
        // A fresh slice excludes time spent awaiting preceding pipelines.
        // compileAsync already yields after each actual object.
        return createScheduler().job('renderer-node-build', () => this.build());
      };
    }
    return builder;
  };
  return () => { backend.createNodeBuilder = original; };
}
