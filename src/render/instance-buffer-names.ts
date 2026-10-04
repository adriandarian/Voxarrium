import { REVISION } from 'three';
import type { Object3D } from 'three';

export interface InstanceUniformBuilder {
  object: (Object3D & { instanceMatrix?: { array: ArrayLike<number> } }) | null;
  getUniformFromNode(node: object, type: string, stage: string, name?: string | null): unknown;
}
export interface InstanceUniformBackend {
  createNodeBuilder(...args: unknown[]): InstanceUniformBuilder;
}

/** Use the installed WGSL builder's explicit-name parameter for its one
 * current instance-matrix buffer. r186 otherwise embeds a fresh NodeUniform
 * ID in generated shader text, defeating exact-code pipeline reuse on reload.
 * The array, node, layout, stage, count and actual bindings stay unchanged.
 * Explicit caller names and every other uniform/buffer retain their path. */
export function scopeInstanceBufferName(builder: InstanceUniformBuilder) {
  const original = builder.getUniformFromNode;
  if (typeof original !== 'function') throw new Error('Three r186 uniform factory contract changed.');
  builder.getUniformFromNode = function (node, type, stage, name) {
    const array = this.object?.instanceMatrix?.array;
    const stableName = type === 'buffer' && !name && array &&
      (node as { value?: unknown }).value === array ? 'voxarriumInstanceMatrix' : name;
    return original.call(this, node, type, stage, stableName);
  };
  return builder;
}

export function installInstanceBufferNames(backend: InstanceUniformBackend,
  selected: WeakMap<Object3D, string>) {
  if (REVISION !== '186') throw new Error('Revalidate instance buffer naming for this Three revision.');
  const original = backend.createNodeBuilder;
  backend.createNodeBuilder = function (...args) {
    const builder = original.apply(this, args);
    return builder.object && selected.has(builder.object) ? scopeInstanceBufferName(builder) : builder;
  };
  return () => { backend.createNodeBuilder = original; };
}
