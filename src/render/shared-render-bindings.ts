import { REVISION } from 'three';

interface UniformBinding {
  isNodeUniformsGroup?: boolean;
  groupNode: { name?: string; shared?: boolean };
  uniforms?: { nodeUniform: { node: { id: number } } }[];
}
interface BindGroup {
  name: string;
  bindings: UniformBinding[];
}
export interface BindingBuilder {
  _getBindGroup(name: string, bindings: UniformBinding[]): BindGroup;
}
export interface BindingBackend {
  createNodeBuilder(...args: unknown[]): BindingBuilder;
}

/**
 * r186.1's NodeBuilder caches shared render groups in a module-private strong
 * Map for each long-lived RenderContext, without removing disposed groups.
 * M7 endpoint graphs demonstrated +2695 uniform-only render groups per circuit.
 * Keep these groups owned by the existing NodeBuilderState instead: identical
 * cached shader states still share them via NodeBuilderState.createBindings(),
 * and Bindings._destroyBindings still releases them at its final reference.
 * Sharing across different builder states is deliberately sacrificed.
 *
 * This uses the installed builder's own BindGroup factory/constructor, without
 * changing global group nodes, shaders, dependencies or renderer prototypes.
 * Reassess this adapter when upgrading Three; upstream now owns this cache in
 * Bindings (https://github.com/mrdoob/three.js/blob/dev/src/renderers/common/Bindings.js).
 */
export function scopeSharedRenderBindings(builder: BindingBuilder) {
  const original = builder._getBindGroup;
  if (typeof original !== 'function') throw new Error('Three r186 binding factory contract changed.');
  builder._getBindGroup = function (name, bindings) {
    const node = bindings[0]?.groupNode;
    if (name !== 'render' || !node?.shared || !bindings.every(binding =>
      binding.isNodeUniformsGroup === true && binding.groupNode === node)) {
      return original.call(this, name, bindings);
    }
    // The original shared path sorts uniforms before assigning layout offsets.
    for (const binding of bindings) binding.uniforms!.sort((a, b) => a.nodeUniform.node.id - b.nodeUniform.node.id);
    // Invoke the ordinary nonshared factory with local metadata, then install
    // the real bindings. No shared singleton is modified, even briefly.
    const group = original.call(this, name, [{ groupNode: { shared: false } }]);
    group.bindings = bindings;
    return group;
  };
  return builder;
}

export function installScopedRenderBindings(backend: BindingBackend) {
  if (REVISION !== '186') throw new Error('Revalidate scoped render bindings for this Three revision.');
  const original = backend.createNodeBuilder;
  backend.createNodeBuilder = function (...args) {
    return scopeSharedRenderBindings(original.apply(this, args));
  };
}
