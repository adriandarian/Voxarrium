import { expect, test } from '@playwright/test';
import { PreparationScheduler } from '../src/render/preparation-scheduler';
import { PreparationCache } from '../src/render/preparation-cache';
import {compileArea} from '../src/render/area-compilation';
import Renderer from 'three/src/renderers/common/Renderer.js';
import NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import { installScheduledNodeBuilds } from '../src/render/scheduled-node-builds';
import type { ScheduledNodeBuilder } from '../src/render/scheduled-node-builds';
import { AssetReferences, ResourceReferences } from '../src/assets/resource-references';
import { createAreaPresentation } from '../src/render/streaming-areas';
import { createStreamingWorld } from '../src/simulation/streaming-world';
import { readFile } from 'node:fs/promises';
import { Mesh,Group,Scene,PerspectiveCamera } from 'three';
import type { MeshStandardMaterial } from 'three';
import { preparedGlbScene } from '../src/assets/abortable-glb';
import type { PreparationResources } from '../src/render/preparation-cache';

// Exercise the installed compileAsync algorithm, not a hand-written imitation.
// Rendering/backend work is stubbed; the native promise deliberately ignores
// abort so the test proves that resource settlement precedes callback rejection.
function compilationFixture(){
  const object=new Group(),scene=new Scene(),camera=new PerspectiveCamera();
  const meshes=Array.from({length:3},(_,i)=>{const mesh=new Mesh();mesh.name=`compile-object-${i}`;object.add(mesh);return mesh;});
  let finishFirst:()=>void=()=>{},entered:string[]=[];
  const native=new Promise<void>(resolve=>{finishFirst=resolve;});
  const originalContext={},originalRender=()=>{},originalHandle=()=>{},nodeFrame={renderId:7,update(){}};
  const renderContext={clippingContext:{updateGlobal(){}}};
  const renderList={begin(){},finish(){},opaque:[{}],transparent:[],transparentDoublePass:[],lightsNode:{}};
  const prototype=Renderer.prototype as unknown as {_createObjectPipeline:(...args:unknown[])=>void};
  const renderer={
    _isDeviceLost:false,_initialized:true,shadowMap:{type:1},needsFrameBufferTarget:false,
    _renderTarget:null,_outputRenderTarget:null,_mrt:null,xr:{isPresenting:false},depth:true,stencil:false,
    _currentRenderContext:originalContext,_currentRenderObjectFunction:originalRender,_handleObjectFunction:originalHandle,
    _compilationPromises:null,_isPreCompiling:false,opaque:true,transparent:false,lighting:{},renderObject(){},
    _renderContexts:{get(){return renderContext;}},_updateCamera(c:PerspectiveCamera){return c;},
    _renderLists:{get(){return renderList;}},_projectObject(){},_background:{update(){}},
    _nodes:{nodeFrame,async getForRenderAsync(){},updateBefore(){},updateForRender(){},updateAfter(){}},
    _geometries:{updateForRender(){}},_bindings:{updateForRender(){}},
    _objects:{get(mesh:Mesh){return {object:mesh};}},
    _pipelines:{getForRender(renderObject:{object:Mesh},promises:Promise<void>[]){
      entered.push(renderObject.object.name);if(entered.length===1)promises.push(native);
    }},
    _renderObjects(){for(const mesh of meshes)prototype._createObjectPipeline.call(renderer,mesh,mesh.material,scene,camera,{},null,renderContext.clippingContext);},
  };
  Object.setPrototypeOf(renderer,Renderer.prototype);
  return {renderer:renderer as unknown as Parameters<typeof compileArea>[0],raw:renderer,object,scene,camera,meshes,
    entered,finishFirst,originalContext,originalRender,originalHandle,nodeFrame};
}

async function withProgressEvent(work:()=>Promise<void>){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'ProgressEvent');
  const previousFrame=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame');
  class TestProgressEvent extends Event{
    readonly lengthComputable:boolean;readonly loaded:number;readonly total:number;
    constructor(type:string,init:ProgressEventInit){super(type);this.lengthComputable=!!init.lengthComputable;this.loaded=init.loaded??0;this.total=init.total??0;}
  }
  Object.defineProperty(globalThis,'ProgressEvent',{value:TestProgressEvent,configurable:true});
  Object.defineProperty(globalThis,'requestAnimationFrame',{value:(callback:FrameRequestCallback)=>{queueMicrotask(()=>callback(performance.now()));return 1;},configurable:true});
  try{await work();}finally{
    if(previous)Object.defineProperty(globalThis,'ProgressEvent',previous);else Reflect.deleteProperty(globalThis,'ProgressEvent');
    if(previousFrame)Object.defineProperty(globalThis,'requestAnimationFrame',previousFrame);else Reflect.deleteProperty(globalThis,'requestAnimationFrame');
  }
}

test('area compilation waits for the current native object, then aborts the installed loop before later objects',async()=>{
  await withProgressEvent(async()=>{
    const f=compilationFixture(),abort=new AbortController(),progress:number[][]=[];let outcome='pending';
    const pending=compileArea(f.renderer,f.object,f.camera,f.scene,abort.signal,event=>progress.push([event.loaded,event.total]))
      .then(()=>{outcome='ready';return null;},error=>{outcome='rejected';return error;});
    try{
      for(let i=0;i<20&&f.entered.length===0;i++)await Promise.resolve();
      expect(f.entered).toEqual(['compile-object-0']);abort.abort();
      for(let i=0;i<5;i++)await Promise.resolve();
      expect(outcome).toBe('pending');expect(f.raw._isPreCompiling).toBe(false);
      expect(f.raw._currentRenderContext).toBe(f.originalContext);
      expect(f.raw._currentRenderObjectFunction).toBe(f.originalRender);expect(f.raw._handleObjectFunction).toBe(f.originalHandle);
      expect(f.nodeFrame.renderId).toBe(7);
      f.finishFirst();await expect(pending).resolves.toMatchObject({name:'AbortError'});
      expect(outcome).toBe('rejected');expect(f.entered).toEqual(['compile-object-0']);
      expect(progress).toEqual([[1,3]]);
    }finally{f.finishFirst();for(const mesh of f.meshes)mesh.geometry.dispose();}
  });
});

test('uncancelled area compilation completes every installed-loop object before ready',async()=>{
  await withProgressEvent(async()=>{
    const f=compilationFixture();try{
      f.finishFirst();await compileArea(f.renderer,f.object,f.camera,f.scene,new AbortController().signal);
      expect(f.entered).toEqual(['compile-object-0','compile-object-1','compile-object-2']);
      expect(f.raw._isPreCompiling).toBe(false);expect(f.raw._currentRenderContext).toBe(f.originalContext);
    }finally{for(const mesh of f.meshes)mesh.geometry.dispose();}
  });
});

test('scheduled complete node builds preserve the installed build stages and reset state', async () => {
  await withProgressEvent(async () => {
    function fixture(object: Mesh) {
      const order: string[] = [];
      const Builder = NodeBuilder as unknown as new (object: Mesh, renderer: object, parser: null) => ScheduledNodeBuilder & {
        context: object; flowNodes: Record<string, unknown[]>; prebuild(): void;
        getBuildStage(): string; getShaderStage(): string; flowNode(node: unknown): void;
        buildCode(): void; buildUpdateNodes(): void;
      };
      const builder = new Builder(object, {}, null);
      builder.prebuild = () => {
        order.push('prebuild'); builder.context = {};
        const node = { build() { order.push(`${builder.getBuildStage()}:${builder.getShaderStage()}`); } };
        builder.flowNodes = { vertex: [node], fragment: [node], compute: [] };
      };
      builder.flowNode = () => { order.push(`${builder.getBuildStage()}:${builder.getShaderStage()}`); };
      builder.buildCode = () => { order.push('code'); }; builder.buildUpdateNodes = () => { order.push('updates'); };
      return { builder, order };
    }
    const mesh = new Mesh(), other = new Mesh(); const reference = fixture(mesh), scheduled = fixture(mesh), untouched = fixture(other);
    const originalAsync = scheduled.builder.buildAsync, otherAsync = untouched.builder.buildAsync;
    let now = 0, frames = 0;
    const scheduler = new PreparationScheduler(new AbortController().signal, {
      now: () => now, nextFrame: async () => { frames++; now += 7; }, onWork: () => {},
    });
    const originalBuild = scheduled.builder.build;
    scheduled.builder.build = function () { const result = originalBuild.call(this); now += 5; return result; };
    const selected = new WeakMap([[mesh, () => scheduler]]);
    const backend = { createNodeBuilder(object: unknown) { return object === mesh ? scheduled.builder : untouched.builder; } };
    const factory = backend.createNodeBuilder, restore = installScheduledNodeBuilds(backend, selected);
    try {
      await reference.builder.buildAsync();
      expect(backend.createNodeBuilder(other).buildAsync).toBe(otherAsync);
      await backend.createNodeBuilder(mesh).buildAsync();
      expect(scheduled.order).toEqual(reference.order);
      expect(scheduled.order).toEqual(['prebuild', 'setup:fragment', 'setup:vertex', 'analyze:fragment', 'analyze:vertex', 'generate:fragment', 'generate:vertex', 'code', 'updates']);
      expect(scheduled.builder.getBuildStage()).toBeNull(); expect(scheduled.builder.getShaderStage()).toBeNull();
      expect(scheduled.builder.buildAsync).toBe(originalAsync); expect(frames).toBe(1);
      expect(scheduler.snapshot()).toMatchObject({ jobs: 2, totalCpuMs: 5, largestJobMs: 5 });
    } finally { restore(); mesh.geometry.dispose(); other.geometry.dispose(); }
    expect(backend.createNodeBuilder).toBe(factory);
  });
});

test('preparation gives rendering a frame between deliberately budgeted slices', async () => {
  const controller = new AbortController();
  let time = 0;
  const order: string[] = [];
  const scheduler = new PreparationScheduler(controller.signal, {
    budgetMs: 3, now: () => time,
    nextFrame: async () => { order.push('frame'); time += 7; },
  });
  function* jobs() {
    for (let i = 0; i < 5; i++) { order.push(`job${i}`); time += 2; yield `job${i + 1}`; }
    return 'ready';
  }
  expect(await scheduler.run('job0', jobs())).toBe('ready');
  expect(order).toEqual(['job0', 'job1', 'frame', 'job2', 'job3', 'frame', 'job4']);
  expect(scheduler.snapshot()).toMatchObject({ budgetMs: 3, jobs: 6, yields: 2,
    totalCpuMs: 10, largestJobMs: 2, oversizeJobs: 0, preparationDurationMs: 24 });
});

test('abort while waiting for a frame closes partial construction and never executes later jobs', async () => {
  const controller = new AbortController();
  let time = 0, cleaned = false, later = false;
  const scheduler = new PreparationScheduler(controller.signal, {
    now: () => time,
    nextFrame: async signal => { controller.abort(); signal.throwIfAborted(); },
  });
  function* jobs() {
    try { time += 4; yield; later = true; }
    finally { cleaned = true; }
  }
  await expect(scheduler.run('partial', jobs())).rejects.toMatchObject({ name: 'AbortError' });
  expect(cleaned).toBe(true); expect(later).toBe(false);
  expect(scheduler.snapshot()).toMatchObject({ jobs: 1, yields: 1, largestJobMs: 4, oversizeJobs: 1 });
});

test('a failed job closes its generator and reports no successful ready value', async () => {
  let cleaned = false;
  const scheduler = new PreparationScheduler(new AbortController().signal, { nextFrame: async () => {} });
  function* jobs() { try { throw new Error('fixture construction failure'); yield; } finally { cleaned = true; } }
  await expect(scheduler.run('broken', jobs())).rejects.toThrow('fixture construction failure');
  expect(cleaned).toBe(true);
});

test('cache and instance lifetime are separate, finite and dispose each identity once', () => {
  const references = new ResourceReferences();
  const cache = new PreparationCache(references, 1);
  let disposals = 0;
  const immutable = { dispose() { disposals++; } };
  cache.retain('accepted.geometry', immutable, [immutable]);
  const instance = references.acquire([immutable]);
  expect(references.snapshot()).toMatchObject({ resources: 1, references: 2 });
  instance(); instance();
  expect(disposals).toBe(0);
  expect(cache.get('accepted.geometry')).toBe(immutable);
  expect(() => cache.retain('another', {}, [])).toThrow('capacity exceeded');
  expect(cache.snapshot()).toMatchObject({ entries: 1, resources: 1, hits: 1, capacity: 1 });
  cache.dispose(); cache.dispose();
  expect(disposals).toBe(1);
  expect(references.snapshot()).toMatchObject({ resources: 0, references: 0 });
});

test('aborted area releases partially attached instances, materials and asset identities', async () => {
  const controller = new AbortController();
  const resources = new ResourceReferences(), assets = new AssetReferences();
  const area = createStreamingWorld().areas.find(area => area.id === 'neighbor-shell')!;
  // Enough individual boxes to force the scheduler's hard job-count yield even on a fast CPU.
  const box = area.course.boxes.find(box => box.visible !== false)!;
  const fixture = { ...area, course: { ...area.course, boxes: Array.from({ length: 128 }, (_, index) => ({ ...box, id: `fixture.${index}` })) } };
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => { queueMicrotask(() => controller.abort()); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    await expect(createAreaPresentation(fixture, controller.signal, true, resources, assets)).rejects.toMatchObject({ name: 'AbortError' });
    expect(resources.snapshot()).toMatchObject({ resources: 0, references: 0 });
    expect(assets.snapshot()).toMatchObject({ assets: 0, references: 0 });
  } finally {
    globalThis.requestAnimationFrame = previousRequest; globalThis.cancelAnimationFrame = previousCancel;
  }
});

test('cached GLB reloads reuse immutable geometry/maps and isolate mutable instance materials', async () => {
  const bytes = await readFile('public/assets/rural/cottage.glb');
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document;
  let fetches = 0;
  // This test verifies ownership and clone contracts; raster appearance is covered by actual browser captures.
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_target, property) => property === 'createRadialGradient' ? () => gradient : () => {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
  globalThis.fetch = async () => { fetches++; return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer); };
  const references = new ResourceReferences(), cache = new PreparationCache(references);
  const controller = new AbortController();
  const scheduler = new PreparationScheduler(controller.signal, { nextFrame: async () => {} });
  function instanceScope() {
    const leases = new Map<{ dispose(): void }, () => void>();
    const scope: PreparationResources = { cache,
      own(resource) { if (!leases.has(resource)) leases.set(resource, references.acquire([resource])); return resource; },
      release(resource) { leases.get(resource)?.(); leases.delete(resource); },
    };
    return { scope, release() { for (const release of leases.values()) release(); leases.clear(); } };
  }
  const first = instanceScope(), second = instanceScope(), third = instanceScope();
  try {
    const a = await preparedGlbScene('/fixture/cottage.glb', 'fixture.cottage', controller.signal, scheduler, first.scope);
    const firstMeshes: Mesh[] = []; a.traverse(object => { if (object instanceof Mesh) firstMeshes.push(object); });
    const material = firstMeshes[0]!.material as MeshStandardMaterial;
    material.color.set(0xff0011); a.position.x = 91;
    const b = await preparedGlbScene('/fixture/cottage.glb', 'fixture.cottage', controller.signal, scheduler, second.scope);
    const secondMeshes: Mesh[] = []; b.traverse(object => { if (object instanceof Mesh) secondMeshes.push(object); });
    expect(fetches).toBe(1); expect(b.position.x).toBe(0);
    expect(secondMeshes.length).toBe(firstMeshes.length);
    for (let i = 0; i < firstMeshes.length; i++) {
      expect(secondMeshes[i]!.geometry === firstMeshes[i]!.geometry).toBe(true);
      expect(secondMeshes[i]!.material === firstMeshes[i]!.material).toBe(false);
      expect((secondMeshes[i]!.material as MeshStandardMaterial).map === (firstMeshes[i]!.material as MeshStandardMaterial).map).toBe(true);
    }
    expect((secondMeshes[0]!.material as MeshStandardMaterial).color.getHex()).not.toBe(0xff0011);
    first.release(); second.release();
    const plateau = references.snapshot(); const cachePlateau = cache.snapshot();
    await preparedGlbScene('/fixture/cottage.glb', 'fixture.cottage', controller.signal, scheduler, third.scope);
    third.release();
    expect(fetches).toBe(1); expect(references.snapshot()).toEqual(plateau);
    expect(cache.snapshot()).toMatchObject({ entries: cachePlateau.entries, resources: cachePlateau.resources,
      references: cachePlateau.references, instanceReferences: 0 });
  } finally {
    first.release(); second.release(); third.release(); cache.dispose();
    globalThis.fetch = previousFetch; globalThis.document = previousDocument;
  }
  expect(references.snapshot()).toMatchObject({ resources: 0, references: 0 });
});
