import { test, expect } from '@playwright/test';
import NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import { scopeSharedRenderBindings } from '../src/render/shared-render-bindings';
import type { BindingBuilder } from '../src/render/shared-render-bindings';

const Builder = NodeBuilder as unknown as new (object: null, renderer: object, parser: null) => BindingBuilder;
function uniforms(groupNode: { name: string; shared: boolean }, ids: number[]) {
  return [{ isNodeUniformsGroup: true, groupNode, uniforms: ids.map(id => ({ nodeUniform: { node: { id } } })) }];
}

test('r186 shared render groups stay with each builder state rather than the persistent context cache', () => {
  const renderer = { _currentRenderContext: {} };
  const node = { name: 'render', shared: true };
  const first = scopeSharedRenderBindings(new Builder(null, renderer, null));
  const second = scopeSharedRenderBindings(new Builder(null, renderer, null));
  const bindings = uniforms(node, [8, 2, 5]);
  const group = first._getBindGroup('render', bindings);
  expect(group.bindings).toBe(bindings);
  expect(bindings[0].uniforms.map(u => u.nodeUniform.node.id)).toEqual([2, 5, 8]);
  expect(group).not.toBe(second._getBindGroup('render', uniforms(node, [8, 2, 5])));
  expect(node.shared).toBe(true);
  expect(group.bindings[0].groupNode).toBe(node);
});

test('the adapter preserves ordinary groups and the installed shared frame-group cache', () => {
  const renderer = { _currentRenderContext: {} };
  const first = scopeSharedRenderBindings(new Builder(null, renderer, null));
  const second = scopeSharedRenderBindings(new Builder(null, renderer, null));
  const frame = { name: 'frame', shared: true };
  expect(first._getBindGroup('frame', uniforms(frame, [109]))).toBe(second._getBindGroup('frame', uniforms(frame, [109])));
  const object = { name: 'object', shared: false };
  const bindings = uniforms(object, [209]);
  const a = first._getBindGroup('object', bindings), b = second._getBindGroup('object', bindings);
  expect(a.bindings).toBe(bindings);
  expect(a).not.toBe(b);
});
