import { expect, test } from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import { AssetReferences, ResourceReferences } from '../src/assets/resource-references';
import { TransitionTelemetry } from '../src/diagnostics/transition';
import { createPhysics } from '../src/physics/physics';
import { createDistrictCourse } from '../src/simulation/district';
import { createRuralCourse } from '../src/simulation/rural';
import { createStreamingController } from '../src/simulation/streaming';
import { areaDistance } from '../src/simulation/streaming-contracts';
import type { AreaHandle, AreaId, StreamingAdapter, WorldArea } from '../src/simulation/streaming-contracts';
import { createStreamingWorld } from '../src/simulation/streaming-world';
import { FIXED_DT, IDLE_INPUT, PLAYER } from '../src/simulation/types';
import type { CourseSpec, GameState, Vec3 } from '../src/simulation/types';

const position = (x: number, z = 5): Vec3 => ({ x, y: 4.04, z });
function emptyCourse(): CourseSpec {
  return { id: 'streaming-test', seed: 104729, spawn: position(5), boxes: [], labels: [], bookmarks: {} };
}
function testAreas(): WorldArea[] {
  return (['rural', 'river-market', 'neighbor-shell'] as AreaId[]).map((id, index) => ({
    id, bounds: { minX: index * 100, maxX: index * 100 + 10, minZ: 0, maxZ: 10 },
    course: emptyCourse(), assetIds: [], npcIds: [],
  }));
}
function handle(id: string, actions: string[]): AreaHandle {
  return { activate() { actions.push(`${id}:activate`); }, deactivate() { actions.push(`${id}:deactivate`); },
    unload() { actions.push(`${id}:unload`); } };
}
function deferredAdapter(actions: string[]) {
  const requests: { id: AreaId; signal: AbortSignal; resolve: (handle: AreaHandle) => void; reject: (error: Error) => void }[] = [];
  const adapter: StreamingAdapter = { load(area, signal) {
    actions.push(`${area.id}:load`);
    return new Promise((resolve, reject) => { requests.push({ id: area.id, signal, resolve, reject }); });
  } };
  return { adapter, requests };
}
async function flushMicrotasks() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

test('requested preparing warming phases remain cancellable and obsolete progress cannot reinstall an area', async () => {
  let phase: (phase: 'preparing' | 'warming') => void = () => {};
  let finish: (handle: AreaHandle) => void = () => {};
  const actions: string[] = [];
  const streaming = createStreamingController(testAreas(), { load(_area, _signal, progress) {
    phase = progress;
    return new Promise(resolve => { finish = resolve; });
  } });
  streaming.update(position(5), 0);
  expect(streaming.snapshot().areas[0].state).toBe('requested');
  await flushMicrotasks();
  expect(streaming.snapshot().areas[0].state).toBe('preparing');
  phase('warming');
  expect(streaming.snapshot().areas[0].state).toBe('warming');
  streaming.update(position(-60), 0);
  phase('preparing');
  expect(streaming.snapshot().areas[0].state).toBe('unloaded');
  finish(handle('obsolete', actions));
  await flushMicrotasks();
  expect(actions).toEqual(['obsolete:unload']);
  expect(streaming.ready('rural')).toBe(false);
  streaming.dispose();
});

test('velocity lookahead prepares early, cancels reversal, and keeps at most two area transports', async () => {
  const actions: string[] = [];
  const { adapter, requests } = deferredAdapter(actions);
  const areas = testAreas().map(area => ({ ...area, assetIds: ['fixture.immutable'] }));
  const streaming = createStreamingController(areas, adapter, { preparationLeadSeconds: 10 });
  streaming.update(position(50), 0, { x: 5.4, y: 0, z: 0 });
  await flushMicrotasks();
  expect(requests.map(request => request.id)).toEqual(['river-market']);
  expect(streaming.snapshot().areas[1].distance).toBe(50);
  streaming.update(position(50), 0, { x: -5.4, y: 0, z: 0 });
  expect(requests[0].signal.aborted).toBe(true);
  await flushMicrotasks();
  requests[0].resolve(handle('obsolete-market', actions));
  await flushMicrotasks();
  expect(actions).toContain('obsolete-market:unload');
  expect(streaming.activeIds()).toEqual([]);
  expect(streaming.snapshot().pendingIds.length + streaming.loadedIds().length).toBeLessThanOrEqual(2);
  streaming.dispose();
});

test('startup prepares only one neighbor, retains it while idle, and normal departure releases the hint', async () => {
  const actions: string[] = [];
  const streaming = createStreamingController(testAreas(), { async load(area) { return handle(area.id, actions); } }, { preparationLeadSeconds: 10 });
  streaming.update(position(5), 0); await streaming.settled();
  streaming.preload('river-market'); await streaming.settled();
  streaming.preload('neighbor-shell'); await streaming.settled();
  streaming.update(position(5), 30);
  expect(streaming.loadedIds()).toEqual(['rural','river-market']);
  expect(streaming.activeIds()).toEqual(['rural']);
  expect(streaming.snapshot().counts.loads).toBe(2);
  streaming.update(position(5), 1.5, { x: -5.4, y: 0, z: 0 });
  expect(streaming.loadedIds()).toEqual(['rural']);
  expect(streaming.snapshot().counts.unloads).toBe(1);
  streaming.dispose();
});

test('preload preparation, activation and readiness are idempotent and measured', async () => {
  const actions: string[] = [];
  const { adapter, requests } = deferredAdapter(actions);
  const streaming = createStreamingController(testAreas(), adapter);
  expect(streaming.snapshot().areas.every(area => area.distance === null)).toBe(true);
  streaming.update(position(5), 0);
  streaming.update(position(5), 1 / 60);
  await flushMicrotasks();
  expect(requests).toHaveLength(1);
  expect(streaming.ready('rural')).toBe(false);
  expect(streaming.loadedIds()).toEqual([]);
  expect(streaming.activeIds()).toEqual([]);
  requests[0].resolve(handle('rural', actions));
  await streaming.settled();
  for (let i = 0; i < 20; i++) streaming.update(position(5), 1 / 60);
  expect(streaming.ready('rural')).toBe(true);
  expect(streaming.activeIds()).toEqual(['rural']);
  expect(actions).toEqual(['rural:load', 'rural:activate']);
  const snapshot = streaming.snapshot();
  expect(snapshot.events.map(event => event.type)).toEqual(['load-start', 'load-complete', 'activate']);
  expect(snapshot.events[1].durationMs).toBeGreaterThanOrEqual(0);
  expect(snapshot.events.every(event => Number.isFinite(event.time))).toBe(true);
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  streaming.dispose();
  streaming.dispose();
  expect(actions).toEqual(['rural:load', 'rural:activate', 'rural:deactivate', 'rural:unload']);
  expect(streaming.loadedIds()).toEqual([]);
  expect(streaming.snapshot().counts.unloads).toBe(1);
});

test('measured earlier retirement retains boundary hysteresis and a full departure delay', async () => {
  const actions: string[] = [];
  const streaming = createStreamingController(testAreas(), { async load(area) { return handle(area.id, actions); } },
    { preparationLeadSeconds: 10, unloadRadius: 46 });
  streaming.update(position(5), 0); await streaming.settled();
  streaming.update(position(55), 0); // 45 m: inactive, retained below retirement radius.
  expect(streaming.activeIds()).toEqual([]);
  expect(streaming.ready('rural')).toBe(true);
  streaming.update(position(57), 1.49);
  expect(streaming.ready('rural')).toBe(true);
  streaming.update(position(56), 1); // Exact 46 m resets the continuous departure timer.
  streaming.update(position(57), 1.49);
  expect(streaming.ready('rural')).toBe(true);
  streaming.update(position(57), .02);
  expect(streaming.ready('rural')).toBe(false);
  expect(actions).toEqual(['rural:activate','rural:deactivate','rural:unload']);
  streaming.dispose();
});

test('boundary oscillation retains prepared resources until real delayed departure', async () => {
  const actions: string[] = [];
  const streaming = createStreamingController(testAreas(), { async load(area) { actions.push(`${area.id}:load`); return handle(area.id, actions); } });
  streaming.update(position(5), 0);
  await streaming.settled();
  for (let i = 0; i < 100; i++) {
    streaming.update(position(47), 0.1); // 37 m: remains active past preload.
    streaming.update(position(46), 0.1);
  }
  expect(actions).toEqual(['rural:load', 'rural:activate']);
  streaming.update(position(54), 0.1); // Exactly 44 m remains active.
  expect(streaming.activeIds()).toEqual(['rural']);
  streaming.update(position(55), 0.1); // 45 m deactivates, retains prepared handle.
  expect(streaming.activeIds()).toEqual([]);
  expect(streaming.ready('rural')).toBe(true);
  streaming.update(position(46), 0.1);
  expect(streaming.activeIds()).toEqual(['rural']);
  streaming.update(position(-44), 1); // 44 m away on other side, still active.
  streaming.update(position(-54), 1); // 54 m: unload timer starts.
  streaming.update(position(-50), 1); // Timer resets inside 52 m.
  streaming.update(position(-54), 0.8);
  expect(streaming.ready('rural')).toBe(true);
  streaming.update(position(-54), 0.7);
  expect(streaming.ready('rural')).toBe(false);
  expect(streaming.snapshot().counts).toMatchObject({ loads: 1, activations: 2, deactivations: 2, unloads: 1 });
  streaming.dispose();
});

test('obsolete loads abort and release late results without stale activation or overlapping transports', async () => {
  const actions: string[] = [];
  const { adapter, requests } = deferredAdapter(actions);
  const streaming = createStreamingController(testAreas(), adapter);
  streaming.update(position(5), 0);
  await flushMicrotasks();
  streaming.update(position(-60), 0);
  expect(requests[0].signal.aborted).toBe(true);
  await streaming.settled(); // The irrelevant canceled transport cannot block departure.
  streaming.update(position(5), 0);
  for (let i = 0; i < 40; i++) { streaming.update(position(-60), 0); streaming.update(position(5), 0); }
  await flushMicrotasks();
  expect(requests).toHaveLength(1); // Abort-ignoring transport is still bounded to one.
  requests[0].resolve(handle('obsolete', actions));
  await flushMicrotasks();
  expect(requests).toHaveLength(2);
  expect(actions).toEqual(['rural:load', 'obsolete:unload', 'rural:load']);
  requests[1].resolve(handle('current', actions));
  await streaming.settled();
  expect(streaming.activeIds()).toEqual(['rural']);
  expect(actions).toEqual(['rural:load', 'obsolete:unload', 'rural:load', 'current:activate']);
  expect(streaming.snapshot().counts).toMatchObject({ loads: 2, cancellations: 1, lateReleases: 1, failures: 0 });
  streaming.dispose();
});

test('dispose during preparation aborts and releases late resources exactly once', async () => {
  const actions: string[] = [];
  const { adapter, requests } = deferredAdapter(actions);
  const streaming = createStreamingController(testAreas(), adapter);
  streaming.update(position(5), 0);
  await flushMicrotasks();
  streaming.dispose();
  streaming.dispose();
  expect(requests[0].signal.aborted).toBe(true);
  requests[0].resolve(handle('late', actions));
  await flushMicrotasks();
  streaming.update(position(5), 1);
  expect(actions).toEqual(['rural:load', 'late:unload']);
  expect(streaming.ready('rural')).toBe(false);
  expect(streaming.snapshot().counts).toMatchObject({ loads: 1, cancellations: 1, lateReleases: 1, failures: 0 });
});

test('cancellation before the preparation microtask skips obsolete adapter work', async () => {
  let loads = 0;
  const streaming = createStreamingController(testAreas(), { async load() {
    loads++;
    return { activate() {}, deactivate() {}, unload() {} };
  } });
  streaming.update(position(5), 0);
  streaming.update(position(-60), 0);
  await flushMicrotasks();
  expect(loads).toBe(0);
  expect(streaming.snapshot().counts).toMatchObject({ cancellations: 1, failures: 0 });
  streaming.update(position(5), 0);
  await streaming.settled();
  expect(loads).toBe(1);
  expect(streaming.ready('rural')).toBe(true);
  streaming.dispose();
});

test('request telemetry includes pre-microtask cancellation, distinct reentry and exactly-once cleanup', async () => {
  let now = 0, requests = 0, preparations = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0 });
  const cleanupIds: string[] = [], handles = new Map<AbortSignal, ReturnType<TransitionTelemetry['begin']>>();
  const streaming = createStreamingController(testAreas(), {
    requested(area, signal) {
      const request = ledger.begin(area.id, ++requests); handles.set(signal, request);
      const cancel = () => request.end('cancelled');
      signal.addEventListener('abort', cancel, { once: true });
      return () => { cleanupIds.push(request.id); signal.removeEventListener('abort', cancel); handles.delete(signal); };
    },
    async load(_area, signal) {
      preparations++;
      const request = handles.get(signal)!; request.event('ready');
      return { activate() { request.event('activation-complete'); }, deactivate() {}, unload() { request.end('unloaded'); } };
    },
  });
  streaming.update(position(5), 0);
  expect(ledger.snapshot().reports).toHaveLength(1); expect(preparations).toBe(0);
  now = 1.7; streaming.update(position(-60), 0); await flushMicrotasks();
  expect(preparations).toBe(0); expect(cleanupIds).toHaveLength(1);
  expect(ledger.snapshot().reports[0]).toMatchObject({ outcome: 'cancelled', startedAtMs: 0, endedAtMs: 1.7,
    readyAtMs: null, pendingSpans: 0, completeChronology: true });
  expect(ledger.snapshot().reports[0].records.map(r => r.name)).toEqual(['request-received', 'cancelled']);
  now = 10; streaming.update(position(5), 0); await streaming.settled();
  const reports = ledger.snapshot().reports;
  expect(reports).toHaveLength(streaming.snapshot().counts.loads);
  expect(reports.map(r => r.requestId)).toEqual([1, 2]); expect(new Set(reports.map(r => r.id)).size).toBe(2);
  expect(preparations).toBe(1); expect(cleanupIds).toEqual(reports.map(r => r.id)); expect(handles.size).toBe(0);
  expect(streaming.snapshot().counts).toMatchObject({ loads: 2, cancellations: 1, failures: 0, lateReleases: 0 });
  streaming.dispose(); streaming.dispose();
  expect(ledger.snapshot().reports.map(r => r.outcome)).toEqual(['cancelled', 'unloaded']);
  expect(cleanupIds).toHaveLength(2);
});

test('request observer faults remain handled load failures and cleanup faults are visible', async () => {
  let preparations = 0;
  const failure = createStreamingController(testAreas(), {
    requested() { throw new Error('request observer failed'); },
    async load() { preparations++; return handle('rural', []); },
  });
  failure.update(position(5), 0); await failure.settled();
  expect(preparations).toBe(0);
  expect(failure.snapshot().counts).toMatchObject({ loads: 1, failures: 1 });
  expect(failure.snapshot().errors[0]).toMatchObject({ type: 'load-error', message: 'Error: request observer failed' });
  failure.update(position(5), 1); await failure.settled(); expect(failure.snapshot().counts.loads).toBe(1);
  failure.dispose();
  const cleanup = createStreamingController(testAreas(), {
    requested() { return () => { throw new Error('request cleanup failed'); }; },
    async load() { return handle('rural', []); },
  });
  cleanup.update(position(5), 0); await cleanup.settled();
  expect(cleanup.snapshot().errors[0]).toMatchObject({ type: 'adapter-error', message: 'Error: request cleanup failed' });
  expect(cleanup.ready('rural')).toBe(true); cleanup.dispose();
});

test('failed loads expose errors without automatic retry loops and retry after departure', async () => {
  let loads = 0;
  const streaming = createStreamingController(testAreas(), { async load() { loads++; throw new Error('diagnosed test transport failure'); } });
  streaming.update(position(5), 0);
  await streaming.settled();
  for (let i = 0; i < 200; i++) streaming.update(position(5), 1 / 60);
  await streaming.settled();
  expect(loads).toBe(1);
  expect(streaming.snapshot().areas[0].state).toBe('failed');
  expect(streaming.snapshot().errors[0].message).toContain('diagnosed test transport failure');
  expect(streaming.snapshot().errors[0].durationMs).toBeGreaterThanOrEqual(0);
  streaming.update(position(-60), 1.6);
  streaming.update(position(5), 0);
  await streaming.settled();
  expect(loads).toBe(2);
  streaming.dispose();
});

test('activation failure releases the prepared handle and prevents a readiness claim', async () => {
  let releases = 0;
  const streaming = createStreamingController(testAreas(), { async load() {
    return { activate() { throw new Error('collision install failed'); }, deactivate() {}, unload() { releases++; } };
  } });
  streaming.update(position(5), 0);
  await streaming.settled();
  expect(streaming.ready('rural')).toBe(false);
  expect(streaming.activeIds()).toEqual([]);
  expect(streaming.snapshot().areas[0].state).toBe('failed');
  expect(streaming.snapshot().errors[0].message).toContain('collision install failed');
  streaming.dispose();
  expect(releases).toBe(1);
});

test('a failed deactivation releases the handle and exposes failure without claiming success', async () => {
  let releases = 0;
  const streaming = createStreamingController(testAreas(), { async load() {
    return { activate() {}, deactivate() { throw new Error('hide failed'); }, unload() { releases++; } };
  } });
  streaming.update(position(5), 0);
  await streaming.settled();
  streaming.update(position(-45), 0);
  expect(streaming.ready('rural')).toBe(false);
  expect(streaming.snapshot().areas[0].state).toBe('failed');
  expect(streaming.snapshot().counts.deactivations).toBe(0);
  expect(streaming.snapshot().errors[0].message).toContain('hide failed');
  streaming.dispose();
  expect(releases).toBe(1);
});

test('disposal continues across adapter errors and lifecycle history remains bounded', async () => {
  const actions: string[] = [];
  const areas = testAreas().map(area => ({ ...area, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } }));
  const streaming = createStreamingController(areas, { async load(area) {
    return { ...handle(area.id, actions), unload() {
      actions.push(`${area.id}:unload`);
      if (area.id === 'rural') throw new Error('test release failure');
    } };
  } });
  streaming.update(position(5), 0);
  await streaming.settled();
  for (let i = 0; i < 100; i++) { streaming.update(position(-45), 0); streaming.update(position(5), 0); }
  expect(streaming.snapshot().events).toHaveLength(256);
  streaming.dispose();
  streaming.dispose();
  expect(actions.filter(action => action.endsWith(':unload'))).toEqual(['rural:unload', 'river-market:unload', 'neighbor-shell:unload']);
  expect(streaming.loadedIds()).toEqual([]);
  expect(streaming.snapshot().errors[0].message).toContain('test release failure');
});

test('area distance and policy validation preserve the exact three-area bound', () => {
  const areas = testAreas();
  expect(areaDistance(areas[0], position(5))).toBe(0);
  expect(areaDistance(areas[0], position(13, 14))).toBe(5);
  const adapter: StreamingAdapter = { async load() { return { activate() {}, deactivate() {}, unload() {} }; } };
  expect(() => createStreamingController(areas.slice(0, 2), adapter)).toThrow('exactly');
  expect(() => createStreamingController([areas[0], areas[0], areas[2]], adapter)).toThrow('exactly');
  expect(() => createStreamingController(areas, adapter, { preloadRadius: 50 })).toThrow('radii');
  const streaming = createStreamingController(areas, adapter);
  expect(() => streaming.update(position(5), NaN)).toThrow('finite');
  expect(() => streaming.update(position(5), -1)).toThrow('nonnegative');
  streaming.dispose();
});

test('resource leases dispose real shared geometry/material once after the last owner', () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const disposed: string[] = [];
  geometry.addEventListener('dispose', () => disposed.push('geometry'));
  material.addEventListener('dispose', () => disposed.push('material'));
  const references = new ResourceReferences();
  const releaseRural = references.acquire([geometry, geometry, material]);
  const releaseMarket = references.acquire([geometry, material, material]);
  expect(references.snapshot()).toEqual({ resources: 2, references: 4, byType: { BoxGeometry: 1, MeshStandardMaterial: 1 } });
  releaseRural();
  releaseRural();
  expect(disposed).toEqual([]);
  expect(references.snapshot().references).toBe(2);
  releaseMarket();
  releaseMarket();
  expect(disposed).toEqual(['geometry', 'material']);
  expect(references.snapshot()).toEqual({ resources: 0, references: 0, byType: {} });
  const fresh = new BoxGeometry();
  expect(() => references.acquire([fresh, geometry])).toThrow('disposed');
  expect(references.snapshot().resources).toBe(0); // Transactional rejection.
  fresh.dispose();
});

test('one throwing resource cannot strand other resources or double-dispose a lease', () => {
  const calls: string[] = [];
  const references = new ResourceReferences();
  const release = references.acquire([{ dispose() { calls.push('broken'); throw new Error('test'); } },
    { dispose() { calls.push('valid'); } }]);
  expect(() => release()).toThrow(AggregateError);
  expect(calls).toEqual(['broken', 'valid']);
  release();
  expect(calls).toEqual(['broken', 'valid']);
  expect(references.snapshot().resources).toBe(0);
});

test('asset identity leases have stable counts and no implicit cache ownership', () => {
  const references = new AssetReferences();
  const releaseA = references.acquire(['district.kit', 'rural.cottage', 'district.kit']);
  const releaseB = references.acquire(['district.kit']);
  expect(references.snapshot()).toEqual({ assets: 2, references: 3, ids: { 'district.kit': 2, 'rural.cottage': 1 } });
  releaseA(); releaseA();
  expect(references.snapshot()).toEqual({ assets: 1, references: 1, ids: { 'district.kit': 1 } });
  releaseB();
  expect(references.snapshot()).toEqual({ assets: 0, references: 0, ids: {} });
});

test('streaming world preserves both accepted areas and adds only a bounded plain shell', () => {
  const { course, areas, residentCourse, route } = createStreamingWorld();
  const rural = createRuralCourse(), district = createDistrictCourse();
  expect(areas.map(area => area.id)).toEqual(['rural', 'river-market', 'neighbor-shell']);
  expect(areas[0].course).toEqual(rural);
  expect(areas[1].course.boxes).toEqual(district.boxes.filter(box => box.id.startsWith('district.')));
  expect(areas[1].course.surfaces).toEqual(district.surfaces!.filter(surface => surface.id.startsWith('district.')));
  expect(course.boxes.filter(box => !box.id.startsWith('shell.'))).toEqual(district.boxes);
  expect(course.surfaces!.filter(surface => !surface.id.startsWith('shell.'))).toEqual(district.surfaces);
  expect(course.id).toBe('m5-streaming-proof');
  expect(course.bounds).toBe(226);
  expect(course.spawn).toEqual(rural.spawn);
  for (const [id, bookmark] of Object.entries(district.bookmarks)) if (id !== 'spawn') expect(course.bookmarks[id], id).toEqual(bookmark);
  expect(course.bookmarks.spawn).toEqual(rural.bookmarks.spawn);
  expect(areas[0].assetIds).toEqual(['rural.cottage', 'rural.shed', 'rural.bridge']);
  expect(areas[2].bounds).toEqual({ minX: 146, maxX: 218, minZ: -48, maxZ: 1 });
  expect(areas[2].assetIds).toEqual([]);
  expect(areas[2].npcIds).toEqual([]);
  expect(areas[2].course.boxes).toHaveLength(9);
  expect(areas[2].course.boxes.filter(box => box.collides)).toHaveLength(3);
  expect(residentCourse.boxes).toEqual([]);
  expect(residentCourse.surfaces).toHaveLength(2);
  expect(residentCourse.surfaces!.map(surface => surface.vertices)).toEqual([
    [36, 4, -15, 60, 4, -15, 60, 4, -5, 36, 4, -5], [134, 4, -15, 158, 4, -15, 158, 4, -5, 134, 4, -5],
  ]);
  expect(new Set(course.boxes.map(box => box.id)).size).toBe(course.boxes.length);
  expect(new Set(course.surfaces!.map(surface => surface.id)).size).toBe(course.surfaces!.length);
  const ids = areas.flatMap(area => area.npcIds);
  expect(ids).toHaveLength(42);
  expect(new Set(ids).size).toBe(42);
  expect(route[0]).toEqual(rural.spawn);
  expect(route.at(-1)).toEqual(rural.spawn);
  expect(route).toContainEqual({ x: 206, y: 4, z: -10 });
  expect(route.filter(point => point.x > 146).length).toBe(1);
});

test('actual Rapier support and capsule clearance cover every streaming route segment', async () => {
  await RAPIER.init();
  const { course, route } = createStreamingWorld();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const ids = new Map<number, string>();
  for (const surface of course.surfaces ?? []) {
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(surface.vertices), new Uint32Array(surface.indices)));
    ids.set(collider.handle, surface.id);
  }
  for (const box of course.boxes.filter(box => box.collides)) {
    const sx = Math.sin((box.rotationX ?? 0) / 2), cx = Math.cos((box.rotationX ?? 0) / 2);
    const sy = Math.sin((box.rotationY ?? 0) / 2), cy = Math.cos((box.rotationY ?? 0) / 2);
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
      .setTranslation(box.position.x, box.position.y, box.position.z).setRotation({ x: sx * cy, y: cx * sy, z: sx * sy, w: cx * cy }));
    ids.set(collider.handle, box.id);
  }
  world.step();
  const failures: string[] = [];
  let samples = 0;
  try {
    const shape = new RAPIER.Capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius);
    for (let segment = 1; segment < route.length; segment++) {
      const a = route[segment - 1], b = route[segment];
      const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15);
      for (let i = 0; i <= count; i++) {
        const t = i / count, p = { x: a.x + (b.x - a.x) * t, y: 4.025, z: a.z + (b.z - a.z) * t };
        const overlaps: string[] = [];
        world.intersectionsWithShape({ ...p, y: p.y + PLAYER.height / 2 }, { x: 0, y: 0, z: 0, w: 1 }, shape,
          collider => { overlaps.push(ids.get(collider.handle)!); return true; });
        const support = world.castRayAndGetNormal(new RAPIER.Ray({ ...p, y: p.y + 0.15 }, { x: 0, y: -1, z: 0 }), 0.3, true);
        if (overlaps.length || !support || support.normal.y < 0.99 || Math.abs(p.y + 0.15 - support.timeOfImpact - 4) > 0.002) {
          if (failures.length < 20) failures.push(`segment${segment} sample${i} ${JSON.stringify(p)} overlaps=${overlaps} support=${support?.timeOfImpact}`);
        }
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(2800);
    expect(failures).toEqual([]);
    await test.info().attach('streaming-route-clearance', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      samples, stepMeters: 0.15, segments: route.length - 1, capsuleRadius: PLAYER.radius, capsuleHeight: PLAYER.height, failures,
    }, null, 2)) });
  } finally { world.free(); }
});

test('actual Rapier player continuously walks all three areas and returns without jumping or recovery', async () => {
  const { course, route } = createStreamingWorld();
  const physics = await createPhysics(course);
  const state: GameState = { sceneId: course.id, seed: course.seed, tick: 0, elapsed: 0, paused: false, resets: 0,
    environment: null, population: [], interaction: null,
    player: { position: { ...course.spawn }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, heading: 0 },
    camera: { mode: 'third-person', yaw: 0, pitch: -0.06, debugPosition: position(5) } };
  const walking = { ...IDLE_INPUT, forward: 1 };
  let steps = 0, maximumStep = 0;
  try {
    for (let frame = 0; frame < 24; frame++) physics.step(state, IDLE_INPUT, FIXED_DT);
    for (let waypoint = 1; waypoint < route.length; waypoint++) {
      const target = route[waypoint];
      const start = state.player.position;
      const frameLimit = Math.ceil((Math.hypot(target.x - start.x, target.z - start.z) / PLAYER.walkSpeed + 4) / FIXED_DT);
      for (let frame = 0; frame < frameLimit; frame++) {
        const p = state.player.position, dx = target.x - p.x, dz = target.z - p.z;
        if (Math.hypot(dx, dz) < 0.10) break;
        state.camera.yaw = Math.atan2(-dx, -dz);
        physics.step(state, walking, FIXED_DT);
        maximumStep = Math.max(maximumStep, Math.hypot(state.player.position.x - p.x, state.player.position.y - p.y, state.player.position.z - p.z));
        steps++;
      }
      for (let frame = 0; frame < 24; frame++) physics.step(state, IDLE_INPUT, FIXED_DT);
      expect(Math.hypot(state.player.position.x - target.x, state.player.position.z - target.z), `waypoint${waypoint}`).toBeLessThan(0.14);
      expect(state.player.grounded, `waypoint${waypoint}`).toBe(true);
      expect(state.player.position.y, `waypoint${waypoint}`).toBeGreaterThan(4);
      expect(state.player.position.y, `waypoint${waypoint}`).toBeLessThan(4.025);
      expect(state.resets).toBe(0);
    }
    expect(steps).toBeGreaterThan(9500);
    expect(maximumStep).toBeLessThan(0.10);
    await test.info().attach('streaming-rapier-route', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      steps, maximumStepMeters: maximumStep, waypoints: route.length, resets: state.resets, jumps: 0,
    }, null, 2)) });
  } finally {
    physics.dispose(); physics.dispose();
    expect(physics.stats()).toEqual({ colliders: 0, bodies: 0, areas: {}, safetyGateCount: 0 });
  }
});

test('three repeated streaming circuits retain support and restore exact actual Rapier collider counts', async () => {
  await RAPIER.init();
  const { areas, residentCourse, route } = createStreamingWorld();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const install = (course: CourseSpec) => {
    const colliders: RAPIER.Collider[] = [];
    for (const surface of course.surfaces ?? []) colliders.push(world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(surface.vertices), new Uint32Array(surface.indices))));
    for (const box of course.boxes.filter(box => box.collides)) {
      const sx = Math.sin((box.rotationX ?? 0) / 2), cx = Math.cos((box.rotationX ?? 0) / 2);
      const sy = Math.sin((box.rotationY ?? 0) / 2), cy = Math.cos((box.rotationY ?? 0) / 2);
      colliders.push(world.createCollider(RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
        .setTranslation(box.position.x, box.position.y, box.position.z).setRotation({ x: sx * cy, y: cx * sy, z: sx * sy, w: cx * cy })));
    }
    return colliders;
  };
  const colliderCount = (course: CourseSpec) => (course.surfaces ?? []).length + course.boxes.filter(box => box.collides).length;
  const residents = install(residentCourse);
  const created: AreaId[] = [], destroyed: AreaId[] = [];
  const streaming = createStreamingController(areas, { async load(area) {
    // No world/collider mutation happens during off-scene preparation.
    let colliders: RAPIER.Collider[] = [], released = false;
    return { activate() {
      if (!colliders.length) { colliders = install(area.course); created.push(area.id); }
    }, deactivate() {}, unload() {
      if (released) return;
      released = true;
      for (const collider of colliders) world.removeCollider(collider, true);
      colliders = [];
      destroyed.push(area.id);
    } };
  } });
  const snapshots: { cycle: number; colliders: number; loadedIds: AreaId[] }[] = [];
  const shape = new RAPIER.Capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius);
  let samples = 0;
  try {
    streaming.update(route[0], 0);
    await streaming.settled();
    const baseline = residents.length + colliderCount(areas[0].course);
    expect(world.colliders.len()).toBe(baseline);
    for (let cycle = 1; cycle <= 3; cycle++) {
      for (let segment = 1; segment < route.length; segment++) {
        const a = route[segment - 1], b = route[segment];
        const distance = Math.hypot(b.x - a.x, b.z - a.z);
        const count = Math.ceil(distance / 1.5), dt = distance / count / PLAYER.walkSpeed;
        for (let i = 1; i <= count; i++) {
          const t = i / count, p = { x: a.x + (b.x - a.x) * t, y: 4.025, z: a.z + (b.z - a.z) * t };
          streaming.update(p, dt);
          await streaming.settled();
          world.step();
          const context = `cycle${cycle} segment${segment} sample${i}`;
          const support = world.castRayAndGetNormal(new RAPIER.Ray({ ...p, y: p.y + 0.15 }, { x: 0, y: -1, z: 0 }), 0.3, true);
          expect(support, context).not.toBeNull();
          expect(p.y + 0.15 - support!.timeOfImpact, context).toBeCloseTo(4, 3);
          let overlaps = 0;
          world.intersectionsWithShape({ ...p, y: p.y + PLAYER.height / 2 }, { x: 0, y: 0, z: 0, w: 1 }, shape,
            () => { overlaps++; return true; });
          expect(overlaps, context).toBe(0);
          expect(world.colliders.len(), context).toBe(residents.length + areas.filter(area => streaming.ready(area.id))
            .reduce((sum, area) => sum + colliderCount(area.course), 0));
          samples++;
        }
      }
      streaming.update(route.at(-1)!, 2);
      await streaming.settled();
      expect(streaming.loadedIds()).toEqual(['rural']);
      expect(world.colliders.len()).toBe(baseline);
      snapshots.push({ cycle, colliders: world.colliders.len(), loadedIds: streaming.loadedIds() });
    }
    // At x206 the market is 60 m away and unloads before the reverse leg;
    // each complete rural/shell/rural cycle therefore loads it twice.
    expect(created.filter(id => id === 'river-market')).toHaveLength(6);
    expect(created.filter(id => id === 'neighbor-shell')).toHaveLength(3);
    expect(destroyed.filter(id => id === 'river-market')).toHaveLength(6);
    expect(destroyed.filter(id => id === 'neighbor-shell')).toHaveLength(3);
    expect(streaming.snapshot().errors).toEqual([]);
    streaming.dispose();
    expect(world.colliders.len()).toBe(residents.length);
    await test.info().attach('streaming-collider-cycles', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      cycles: 3, samples, baselineColliders: baseline, residentColliders: residents.length, snapshots,
      created, destroyed, lifecycle: streaming.snapshot(),
    }, null, 2)) });
  } finally { streaming.dispose(); world.free(); }
});
