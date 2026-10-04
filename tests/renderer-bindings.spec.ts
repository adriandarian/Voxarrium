import { test, expect } from '@playwright/test';
import NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import { scopeSharedRenderBindings } from '../src/render/shared-render-bindings';
import type { BindingBuilder } from '../src/render/shared-render-bindings';
// @ts-expect-error Installed r186.1 private module lacks a declaration in pinned @types/three 0.186.0; the fixture supplies its verified ABI.
import Pipelines from 'three/src/renderers/common/Pipelines.js';
import { Mesh } from 'three';
import { InstancedMesh, BoxGeometry, MeshBasicMaterial } from 'three';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
import BufferNode from 'three/src/nodes/accessors/BufferNode.js';
import { scopeInstanceBufferName, installInstanceBufferNames } from '../src/render/instance-buffer-names';
import type { InstanceUniformBuilder } from '../src/render/instance-buffer-names';
import { installPipelineCache } from '../src/render/pipeline-cache';
import type { PipelineManager } from '../src/render/pipeline-cache';

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

function pipelineFixture(capacity = 256, deferred = false) {
  const data = new WeakMap<object, { pipeline?: unknown; error?: boolean }>();
  let nativeCreates = 0, programs = 0, finish: (failed?: boolean) => void = () => {};
  const backend = {
    get(object: object) { let value = data.get(object); if (!value) { value = {}; data.set(object, value); } return value; },
    createProgram() {}, needsRenderUpdate() { return false; }, getRenderCacheKey() { return 'exact-installed-layout'; },
    createRenderPipeline(object: { pipeline: object }, promises: Promise<unknown>[] | null) {
      nativeCreates++; const value = this.get(object.pipeline);
      if (deferred && promises) promises.push(new Promise<void>(resolve => {
        finish = failed => { value.error = !!failed; if (!failed) value.pipeline = {}; resolve(); };
      })); else value.pipeline = {};
    },
  };
  const Manager = Pipelines as unknown as new (backend: object, nodes: object, info: object) => PipelineManager & {
    delete(object: object): unknown; caches: Map<string, unknown>;
    programs: { vertex: Map<string, unknown>; fragment: Map<string, unknown> };
  };
  const manager = new Manager(backend, {}, { createProgram() { programs++; }, destroyProgram() { programs--; } });
  const selected = new WeakMap<Mesh, string>();
  const factory = manager.getForRender, cache = installPipelineCache(manager, selected, capacity);
  const objects: Mesh[] = [];
  function object(code: string, cached = true) {
    const mesh = new Mesh(); objects.push(mesh); if (cached) selected.set(mesh, 'rural');
    return { object: mesh, material: { name: code },
      getNodeBuilderState() { return { vertexShader: `vertex:${code}`, fragmentShader: `fragment:${code}` }; } };
  }
  return { manager, cache, object, factory, finish: (failed = false) => finish(failed),
    unselect: (mesh: Mesh) => selected.delete(mesh),
    nativeCreates: () => nativeCreates, programs: () => programs,
    cleanup() { cache.dispose(); for (const mesh of objects) mesh.geometry.dispose(); } };
}

test('installed WGSL instance-matrix names reuse exact declarations while retaining distinct bindings', () => {
  const make = (count: number, scoped: boolean) => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), count);
    // Pinned @types exposes an empty WGSL builder; this fixture states the
    // installed r186.1 methods/fields inspected above, with no native device.
    const builder = new WGSLNodeBuilder(mesh, { backend: {}, debug: { diagnostics: false } } as never) as unknown as {
      getUniformFromNode(node: object, type: string, stage: string, name?: string | null): { name: string };
      bindingsIndexes: Record<string, { group: number; binding: number }>;
      getUniforms(stage: string): string;
      getBindGroupArray(group: string, stage: string): object[];
    };
    if (scoped) scopeInstanceBufferName(builder as unknown as InstanceUniformBuilder);
    const node = new BufferNode(mesh.instanceMatrix.array as never, 'mat4', count);
    const uniform = builder.getUniformFromNode(node, 'buffer', 'vertex');
    builder.bindingsIndexes[node.groupNode.name] = { group: 1, binding: 0 };
    return { mesh, builder, node, uniform, code: builder.getUniforms('vertex'),
      binding: builder.getBindGroupArray(node.groupNode.name, 'vertex')[0],
      dispose() { mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); } };
  };
  const originalA = make(36, false), originalB = make(36, false), a = make(36, true), b = make(36, true), otherCount = make(35, true);
  try {
    expect(originalA.uniform.name).not.toBe(originalB.uniform.name);
    expect(originalA.code).not.toBe(originalB.code);
    expect(a.uniform.name).toBe('voxarriumInstanceMatrix'); expect(a.code).toBe(b.code);
    expect(a.code).not.toBe(otherCount.code); expect(a.code).toContain('36');
    expect(a.binding).not.toBe(b.binding);
    expect((a.binding as unknown as { nodeUniform: unknown }).nodeUniform).toBe(a.node);
    expect((b.binding as unknown as { nodeUniform: unknown }).nodeUniform).toBe(b.node);
    expect(a.builder.getUniformFromNode(a.node, 'buffer', 'vertex')).toBe(a.uniform);
    const explicit = new BufferNode(a.mesh.instanceMatrix.array as never, 'mat4', 36);
    expect(a.builder.getUniformFromNode(explicit, 'buffer', 'vertex', 'authoredMatrix')).toHaveProperty('name', 'authoredMatrix');
    const unrelated = new BufferNode(new Float32Array(16) as never, 'mat4', 1);
    expect(a.builder.getUniformFromNode(unrelated, 'buffer', 'vertex').name).toMatch(/^NodeBuffer_/);
  } finally { for (const fixture of [originalA, originalB, a, b, otherCount]) fixture.dispose(); }
});

test('stable instance names are scoped by area mesh and restore the renderer-local factory', () => {
  const selected = new WeakMap<Mesh, string>(), mesh = new Mesh(), ordinary = new Mesh();
  selected.set(mesh, 'river-market');
  const originalUniform = (_node: object, _type: string, _stage: string, name?: string | null) => name;
  const factory = (object: unknown) => ({ object: object as Mesh, getUniformFromNode: originalUniform });
  const backend = { createNodeBuilder: factory }, restore = installInstanceBufferNames(backend, selected);
  try {
    expect(backend.createNodeBuilder(mesh).getUniformFromNode).not.toBe(originalUniform);
    expect(backend.createNodeBuilder(ordinary).getUniformFromNode).toBe(originalUniform);
    selected.delete(mesh); expect(backend.createNodeBuilder(mesh).getUniformFromNode).toBe(originalUniform);
  } finally { restore(); mesh.geometry.dispose(); ordinary.geometry.dispose(); }
  expect(backend.createNodeBuilder).toBe(factory);
});

test('bounded native pipeline leases reuse the installed exact-key cache after area object deletion', () => {
  const f = pipelineFixture(); const first = f.object('same');
  try {
    const pipeline = f.manager.getForRender(first);
    const afterPreparation = f.cache.snapshot();
    for (let frame = 0; frame < 100; frame++) expect(f.manager.getForRender(first)).toBe(pipeline);
    expect(f.cache.snapshot()).toEqual(afterPreparation);
    expect(pipeline.usedTimes).toBe(2); f.manager.delete(first);
    expect(pipeline.usedTimes).toBe(1); expect(f.cache.snapshot()).toMatchObject({ entries: 1, programs: 2 });
    const second = f.object('same'); expect(f.manager.getForRender(second)).toBe(pipeline);
    expect(f.nativeCreates()).toBe(1); f.manager.delete(second);
    expect(Object.keys(pipeline).sort()).toEqual(['cacheKey', 'fragmentProgram', 'usedTimes', 'vertexProgram']);
    f.cache.dispose(); expect(pipeline.usedTimes).toBe(0); expect(f.manager.caches.size).toBe(0); expect(f.programs()).toBe(0);
    expect(f.manager.getForRender).toBe(f.factory);
  } finally { f.cleanup(); }
});

test('pipeline LRU eviction preserves active object references and releases only the cache lease', () => {
  const f = pipelineFixture(2), a = f.object('a'), b = f.object('b'), c = f.object('c'), ordinary = f.object('ordinary', false);
  try {
    const pa = f.manager.getForRender(a); f.manager.getForRender(b); f.manager.delete(b);
    f.manager.getForRender(c); f.manager.delete(c);
    expect(f.cache.snapshot()).toMatchObject({ entries: 2, capacity: 2, evictions: 1 });
    expect(pa.usedTimes).toBe(1); expect(f.manager.caches.has(pa.cacheKey)).toBe(true);
    const afterEviction = f.cache.snapshot();
    for (let frame = 0; frame < 100; frame++) f.manager.getForRender(a);
    expect(f.cache.snapshot()).toEqual(afterEviction);
    f.manager.delete(a); expect(f.manager.caches.has(pa.cacheKey)).toBe(false);
    f.manager.getForRender(ordinary); f.manager.delete(ordinary);
    expect(f.cache.snapshot().entries).toBe(2);
    f.cache.dispose(); f.cache.dispose(); expect(f.programs()).toBe(0); expect(f.manager.caches.size).toBe(0);
  } finally { f.cleanup(); }
});

test('pipeline cache awaits native settlement and excludes failed native results', async () => {
  for (const failed of [false, true]) {
    const f = pipelineFixture(2, true), object = f.object('async'), waits: Promise<unknown>[] = [];
    try {
      const pipeline = f.manager.getForRender(object, waits);
      expect(f.cache.snapshot()).toMatchObject({ entries: 0, pending: 1 }); expect(pipeline.usedTimes).toBe(1);
      f.finish(failed); await Promise.all(waits);
      expect(f.cache.snapshot()).toMatchObject({ entries: failed ? 0 : 1, pending: 0 });
      f.manager.delete(object); f.cache.dispose(); expect(f.programs()).toBe(0); expect(pipeline.usedTimes).toBe(0);
    } finally { f.cleanup(); }
  }
});
