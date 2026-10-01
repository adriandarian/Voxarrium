import { expect, test } from '@playwright/test';
import { PreparationScheduler } from '../src/render/preparation-scheduler';
import { PreparationCache } from '../src/render/preparation-cache';
import { AssetReferences, ResourceReferences } from '../src/assets/resource-references';
import { createAreaPresentation } from '../src/render/streaming-areas';
import { createStreamingWorld } from '../src/simulation/streaming-world';
import { readFile } from 'node:fs/promises';
import { Mesh } from 'three';
import type { MeshStandardMaterial } from 'three';
import { preparedGlbScene } from '../src/assets/abortable-glb';
import type { PreparationResources } from '../src/render/preparation-cache';

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
