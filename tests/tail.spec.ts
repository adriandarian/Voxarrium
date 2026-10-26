import { test, expect } from '@playwright/test';
import { TailTelemetry } from '../src/diagnostics/tail';
import { TransitionTelemetry } from '../src/diagnostics/transition';
import { installTransitionCapture } from '../tools/transition-capture.mjs';
import type { TransitionCapture } from '../tools/transition-capture.mjs';
import type { TransitionRecord } from '../src/diagnostics/transition';

test('tail is opt-in and preserves return values, throws and asynchronous rejection', async () => {
  const disabled = new TailTelemetry({ enabled: false, observe: false });
  expect(disabled.span('result', () => 27)).toBe(27);
  expect(() => disabled.span('throws', () => { throw new Error('original'); })).toThrow('original');
  await expect(disabled.asyncSpan('rejects', () => Promise.reject(new Error('original rejection')))).rejects.toThrow('original rejection');
  disabled.event('ignored'); disabled.frame(10); disabled.frame(900);
  expect(disabled.snapshot()).toMatchObject({ enabled: false, frameCount: 0, records: [], frameGaps: [], spans: {} });
});

test('tail correlates a long rAF gap with timed subsystem evidence and dispatch age', () => {
  let now = 100;
  const telemetry = new TailTelemetry({ enabled: true, now: () => now, timeOrigin: 1234, observe: false });
  telemetry.frame(100, 102);
  now = 110;
  telemetry.event('asset.start', { id: 'market' });
  telemetry.span('initialize', () => { now = 175; });
  now = 980;
  telemetry.frame(970, 980);
  const snapshot = telemetry.snapshot();
  expect(snapshot.spans.initialize).toEqual({ count: 1, totalMs: 65, maxMs: 65, failures: 0 });
  expect(snapshot.frameGaps).toHaveLength(1);
  expect(snapshot.frameGaps[0]).toMatchObject({ intervalMs: 870, rafTimestampAgeMs: 10, previousCallbackStartMs: 102 });
  expect(snapshot.frameGaps[0].overlappingRecords.map(record => record.name)).toEqual(['asset.start', 'initialize']);
  expect(snapshot.timeOrigin).toBe(1234);
  expect(snapshot.limitations.join(' ')).toContain('GPU timestamp queries');
});

test('tail bounds records, gap retention, span names and arbitrary payload graphs', () => {
  let now = 0;
  const telemetry = new TailTelemetry({ enabled: true, now: () => now, capacity: 3, observe: false, slowSpanMs: 0 });
  const cyclic: Record<string, unknown> = { text: 'a'.repeat(2000) };
  cyclic.self = cyclic;
  for (let index = 0; index < 10; index++) {
    now += 100;
    telemetry.event(`event-${index}`, cyclic); telemetry.frame(now);
  }
  const snapshot = telemetry.snapshot();
  expect(snapshot.records.map(record => record.name)).toEqual(['event-7', 'event-8', 'event-9']);
  expect(snapshot.records).toHaveLength(3); expect(snapshot.frameGaps).toHaveLength(3);
  expect(snapshot.dropped).toEqual({ records: 7, importantRecords: 7, frameGaps: 6 });
  expect(snapshot.records[0].detail).toEqual({ text: 'a'.repeat(500), self: '[bounded]' });
  for (let index = 0; index < 100; index++) telemetry.span(`span-${index}`, () => {});
  expect(Object.keys(telemetry.snapshot().spans)).toHaveLength(65);
  expect(() => new TailTelemetry({ capacity: 0 })).toThrow('capacity');
});

test('rare observer/event records survive frequent span eviction, with prototype-safe span names', () => {
  let now = 0;
  const telemetry = new TailTelemetry({ enabled: true, now: () => now, capacity: 3, observe: false, slowSpanMs: 0 });
  telemetry.event('load.start');
  for (let index = 0; index < 10; index++) telemetry.span('__proto__', () => { now++; });
  const snapshot = telemetry.snapshot();
  expect(snapshot.records.every(record => record.kind === 'span')).toBe(true);
  expect(snapshot.importantRecords.map(record => record.name)).toEqual(['load.start']);
  expect(snapshot.spans['__proto__']).toMatchObject({ count: 10, totalMs: 10 });
});

test('tail reset severs previous rAF history and discards in-flight spans from an earlier capture', async () => {
  let now = 100;
  const telemetry = new TailTelemetry({ enabled: true, now: () => now, observe: false });
  let finish!: () => void;
  const pending = telemetry.asyncSpan('old-load', () => new Promise<void>(resolve => { finish = resolve; }));
  telemetry.frame(100); now = 200; telemetry.reset(); finish(); await pending;
  telemetry.frame(2000);
  expect(telemetry.snapshot()).toMatchObject({ frameCount: 1, records: [], frameGaps: [], spans: {} });
  now = 2010;
  await expect(telemetry.asyncSpan('new-failure', () => { now = 2018; return Promise.reject(new Error('failed')); })).rejects.toThrow('failed');
  expect(telemetry.snapshot().spans['new-failure']).toMatchObject({ count: 1, totalMs: 8, failures: 1 });
  telemetry.dispose(); telemetry.dispose(); telemetry.event('after-dispose'); telemetry.frame(4000);
  expect(telemetry.snapshot()).toMatchObject({ disposed: true, frameCount: 1 });
});

test('PerformanceObserver entries retain distinct wall-time meanings and disconnect on disposal', () => {
  const original = globalThis.PerformanceObserver;
  const observers: FakeObserver[] = [];
  class FakeObserver {
    static supportedEntryTypes = ['longtask', 'resource', 'long-animation-frame'];
    type = ''; disconnected = false; queued: PerformanceEntry[] = [];
    constructor(private readonly callback: PerformanceObserverCallback) { observers.push(this); }
    observe(options: PerformanceObserverInit) { this.type = options.type!; }
    takeRecords() { const entries = this.queued; this.queued = []; return entries; }
    disconnect() { this.disconnected = true; }
    deliver(entry: Record<string, unknown>) {
      this.callback({ getEntries: () => [entry] } as unknown as PerformanceObserverEntryList, this as unknown as PerformanceObserver);
    }
  }
  globalThis.PerformanceObserver = FakeObserver as unknown as typeof PerformanceObserver;
  try {
    const telemetry = new TailTelemetry({ enabled: true, now: () => 100, timeOrigin: 0 });
    observers.find(observer => observer.type === 'resource')!.deliver({ entryType: 'resource', name: 'kit.glb', startTime: 110, duration: 40, transferSize: 500, decodedBodySize: 1000 });
    observers.find(observer => observer.type === 'longtask')!.deliver({ entryType: 'longtask', name: 'self', startTime: 150, duration: 65, attribution: [{ containerType: 'window' }] });
    observers.find(observer => observer.type === 'long-animation-frame')!.deliver({ entryType: 'long-animation-frame', name: 'frame', startTime: 210, duration: 90, renderStart: 250, styleAndLayoutStart: 280, blockingDuration: 40, scripts: [{ sourceFunctionName: 'frame', duration: 8 }] });
    const snapshot = telemetry.snapshot();
    expect(snapshot.support).toEqual({ resource: 'observed', longtask: 'observed', 'long-animation-frame': 'observed' });
    expect(snapshot.records.map(record => record.kind)).toEqual(['resource', 'longtask', 'long-animation-frame']);
    expect(snapshot.records.at(-1)?.detail).toMatchObject({ renderStart: 250, blockingDuration: 40, scripts: [{ sourceFunctionName: 'frame', duration: 8 }] });
    telemetry.dispose();
    expect(observers.every(observer => observer.disconnected)).toBe(true);
  } finally { globalThis.PerformanceObserver = original; }
});

test('complete transition chronology survives noisy span eviction and capture reset', async () => {
  let now = 100;
  const telemetry = new TailTelemetry({ enabled: true, now: () => now, timeOrigin: 1234, capacity: 3, slowSpanMs: 0, observe: false });
  const transition = telemetry.beginTransition('river-market', 2, { source: 'preload' });
  let finish!: () => void;
  const preparation = transition.asyncSpan('preparation', () => new Promise<void>(resolve => { finish = resolve; }));
  now = 110;
  transition.span('asset-lookup', () => { now = 112; });
  transition.work({ name: 'terrain', startMs: 113, durationMs: 7, budgetMs: 4, yielded: true });
  for (let index = 0; index < 100; index++) telemetry.span('noisy-render', () => { now++; });
  telemetry.reset();
  now = 300; finish(); await preparation;
  transition.event('ready');
  telemetry.frame(310); now = 320; transition.event('boundary-crossed');
  transition.event('activation-complete');
  telemetry.frame(400); now = 400; transition.event('first-visible-frame');
  now = 500; transition.end('unloaded');
  const report = telemetry.snapshot().transitions.reports[0];
  expect(report).toMatchObject({ areaId: 'river-market', requestId: 2, startedAtMs: 100, endedAtMs: 500, outcome: 'unloaded',
    readyAtMs: 300, requestToReadyMs: 200, preparationDurationMs: 200, readyBeforeBoundary: true, readyLeadBeforeBoundaryMs: 20,
    activationFrameMaximumMs: 90, largestSchedulerJob: { durationMs: 7, detail: { name: 'terrain', budgetMs: 4, yielded: true } },
    completeChronology: true, droppedRecords: 0, pendingSpans: 0 });
  expect(report.records.map(record => record.name)).toEqual(['request-received', 'preparation', 'asset-lookup', 'asset-lookup',
    'scheduler-job', 'scheduler-job', 'preparation', 'ready', 'boundary-crossed', 'activation-complete', 'first-visible-frame', 'unloaded']);
  expect(report.records.filter(record => record.name === 'scheduler-job').map(record => record.timeMs)).toEqual([113, 120]);
  expect(telemetry.snapshot().records).toEqual([]);
});

test('transition cancellation retains a rejected late span and request identities distinguish reentry', async () => {
  let now = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0 });
  const cancelled = ledger.begin('rural', 1);
  let reject!: (reason: Error) => void;
  const pending = cancelled.asyncSpan('asset-load', () => new Promise<void>((_resolve, fail) => { reject = fail; }));
  now = 5; cancelled.end('cancelled');
  now = 9; reject(new Error('abort')); await expect(pending).rejects.toThrow('abort');
  const reentry = ledger.begin('rural', 2);
  now = 20; reentry.event('boundary-crossed'); now = 30; reentry.event('ready');
  reentry.end('unloaded');
  const reports = ledger.snapshot().reports;
  expect(reports[0]).toMatchObject({ outcome: 'cancelled', pendingSpans: 0, requestToReadyMs: null, readyBeforeBoundary: null });
  expect(reports[0].records.at(-1)).toMatchObject({ name: 'asset-load', kind: 'span-end', timeMs: 9, durationMs: 9, detail: { failed: true } });
  expect(reports[1]).toMatchObject({ requestId: 2, readyBeforeBoundary: false, readyLeadBeforeBoundaryMs: -10 });
  expect(cancelled.id).not.toBe(reentry.id);
});

test('transition retention evicts ended lifecycles as units and exposes every bound', () => {
  let now = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0, maxActive: 1, maxCompleted: 2, maxRecordsPerTransition: 3 });
  const first = ledger.begin('rural', 1);
  const unretained = ledger.begin('river-market', 2);
  expect(unretained.span('transparent', () => 7)).toBe(7);
  const payload: Record<string, unknown> = { text: 'x'.repeat(1000) }; payload.self = payload;
  first.event('context', payload); payload.text = 'mutated';
  expect(ledger.snapshot().reports[0].records[1].detail).toEqual({ text: 'x'.repeat(500), self: '[bounded]' });
  for (let index = 0; index < 5; index++) { now++; first.event(`step-${index}`); }
  first.end('unloaded');
  let report = ledger.snapshot().reports[0];
  expect(report.records.map(record => record.name)).toEqual(['request-received', 'step-4', 'unloaded']);
  expect(report.completeChronology).toBe(false); expect(report.droppedRecords).toBe(5);
  ledger.begin('river-market', 3).end('unloaded'); ledger.begin('rural', 4).end('failed');
  expect(ledger.snapshot()).toMatchObject({ dropped: { completedLifecycles: 1, rejectedRequests: 1, records: 0 } });
  expect(ledger.snapshot().reports.map(report => report.requestId)).toEqual([3, 4]);
  ledger.dispose(); ledger.begin('rural', 5).event('ignored');
  expect(ledger.snapshot().reports).toHaveLength(2);
});

test('exported completed telemetry can be released before heap sampling without losing active or late spans', async () => {
  const ledger = new TransitionTelemetry({ enabled: true, now: () => 1, timeOrigin: 0 });
  ledger.begin('river-market', 1).end('unloaded');
  const active = ledger.begin('rural', 2);
  const pending = ledger.begin('neighbor-shell', 3);
  let complete!: () => void;
  const work = pending.asyncSpan('late-native-wait', () => new Promise<void>(resolve => { complete = resolve; }));
  pending.end('cancelled');
  ledger.discardExportedCompleted();
  expect(ledger.snapshot().reports.map(report => report.requestId).sort()).toEqual([2,3]);
  complete(); await work;
  ledger.discardExportedCompleted();
  expect(ledger.snapshot().reports.map(report => report.requestId)).toEqual([2]);
  expect(ledger.snapshot().drainedLifecycles).toBe(2);
  active.event('ready'); expect(ledger.snapshot().reports[0].readyAtMs).toBe(1);
});

test('scheduler telemetry coalesces jobs within a slice while preserving CPU totals and guard lead', () => {
  let now = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0, maxRecordsPerTransition: 12 });
  const transition = ledger.begin('river-market', 1);
  transition.event('preparing');
  for (let index = 0; index < 1000; index++) transition.work({ name: `modules-${index % 2}`, startMs: index / 1000, durationMs: .001, budgetMs: 4, yielded: index === 999 });
  now = 2; transition.event('warming'); now = 3; transition.event('boundary-needed');
  now = 4; transition.event('ready'); now = 5; transition.event('boundary-crossed');
  const report = ledger.snapshot().reports[0];
  expect(report.records.map(record => record.name)).toEqual(['request-received', 'preparing', 'scheduler-job', 'scheduler-job', 'warming', 'boundary-needed', 'ready', 'boundary-crossed']);
  expect(report).toMatchObject({ completeChronology: true, totalSchedulerJobs: 1000, readyBeforeBoundary: true,
    readyBeforeBoundaryNeeded: false, readyLeadBeforeBoundaryNeededMs: -1, largestSchedulerJob: { durationMs: .001 } });
  expect(report.totalSchedulerCpuMs).toBeCloseTo(1, 8);
  expect(report.records[3].detail).toMatchObject({ context: { name: '[mixed jobs]', labels: ['modules-0', 'modules-1'],
    jobs: 1000, cpuTotalMs: expect.any(Number), largestJobMs: .001, yielded: true } });
});

test('live tail retains the same peak, overlap, ties and loss counters without aliasing retained evidence', () => {
  let now = 0;
  const tail = new TailTelemetry({ enabled: true, now: () => now, observe: false, capacity: 3, slowSpanMs: 0 });
  tail.frame(0);
  for (const time of [100, 200, 300, 400]) {
    now = time - 20; tail.event('evidence', { time });
    tail.span('work', () => { now += 10; });
    now = time; tail.frame(time, time + 2);
  }
  const full = tail.snapshot(), live = tail.liveSnapshot();
  const peak = full.frameGaps.reduce((a, b) => b.intervalMs > a.intervalMs ? b : a);
  expect(live).toEqual({ maxIntervalMs: full.maxIntervalMs, spans: full.spans, dropped: full.dropped, recentPeakGap: peak });
  expect(live.recentPeakGap!.startMs).toBe(100); // first retained maximum on ties
  live.spans.work.count = -1; live.recentPeakGap!.nearbyRecords.length = 0;
  expect(tail.liveSnapshot().spans.work.count).toBe(4);
  expect(tail.snapshot().frameGaps[0].nearbyRecords.length).toBeGreaterThan(0);
  tail.reset(); expect(tail.liveSnapshot()).toEqual({ maxIntervalMs: 0, spans: {}, dropped: { records: 0, importantRecords: 0, frameGaps: 0 }, recentPeakGap: null });
});

test('settled export waits for processed rAF beyond the inclusive window and captures a delayed overlapping maximum', () => {
  let now = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0 });
  const request = ledger.begin('civic-terrace', 1);
  now = 10; request.event('ready'); request.event('activation-complete');
  now = 100; request.end('unloaded');
  now = 3000; ledger.frame(0, 2050);
  expect(ledger.settledSnapshot(new Set()).reports).toEqual([]);
  ledger.frame(2050, 2100); // exactly endedAt + 2000 remains inclusive
  expect(ledger.settledSnapshot(new Set()).reports).toEqual([]);
  ledger.frame(2100, 5000); // delayed rAF still overlaps through its FROM time
  const exported = ledger.settledSnapshot(new Set()).reports[0];
  expect(exported.maximumFrameIntervalMs).toBe(2900);
  expect(exported).toEqual(ledger.snapshot().reports[0]);
  ledger.frame(5000, 9000);
  expect(ledger.snapshot().reports[0]).toEqual(exported);
  expect(ledger.settledSnapshot(new Set([request.id])).reports).toEqual([]);
  expect(ledger.snapshot()).toMatchObject({ drainedLifecycles: 0, reports: [exported] });
});

test('settled export retains late cancelled spans and live reentry without draining or mutable aliases', async () => {
  let now = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0 });
  const request = ledger.begin('noble-quarter', 1);
  let complete!: () => void;
  const work = request.asyncSpan('native-wait', () => new Promise<void>(resolve => { complete = resolve; }));
  now = 5; request.end('cancelled');
  const active = ledger.begin('noble-quarter', 2);
  now = 3000; ledger.frame(0, 3000);
  expect(ledger.settledSnapshot(new Set()).reports).toEqual([]);
  now = 3500; complete(); await work;
  const exported = ledger.settledSnapshot(new Set()).reports;
  expect(exported).toHaveLength(1);
  expect(exported[0].records.at(-1)).toMatchObject({ kind: 'span-end', name: 'native-wait', timeMs: 3500, durationMs: 3500 });
  exported[0].records.length = 0;
  expect(ledger.snapshot().reports[0].records).toHaveLength(4);
  active.event('ready');
  expect(ledger.snapshot().reports[1]).toMatchObject({ id: active.id, readyAtMs: 3500, endedAtMs: null });
  expect(ledger.snapshot().drainedLifecycles).toBe(0);
});

test('settled export exposes incomplete chronology and original loss counters even when IDs are excluded', () => {
  let now = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0, maxActive: 1, maxRecordsPerTransition: 3 });
  const request = ledger.begin('rural', 1); ledger.begin('other', 2);
  for (let index = 0; index < 5; index++) { now++; request.event('row'); }
  request.end('unloaded'); now = 3000; ledger.frame(0, now);
  const full = ledger.snapshot(), selected = ledger.settledSnapshot(new Set());
  expect(selected.reports[0]).toMatchObject({ completeChronology: false, droppedRecords: 4 });
  expect(selected.dropped).toEqual(full.dropped);
  expect(ledger.settledSnapshot(new Set([request.id]))).toMatchObject({ reports: [], dropped: full.dropped, drainedLifecycles: 0 });
});

test('settled requests reassemble exact chronology through bounded capture chunks before ledger eviction', () => {
  let now = 0;
  const ledger = new TransitionTelemetry({ enabled: true, now: () => now, timeOrigin: 0, maxCompleted: 2 });
  const seen = new Set<string>(), target = {} as { __transitionCapture: TransitionCapture<TransitionRecord> };
  installTransitionCapture(target);
  const persisted: ReturnType<TransitionTelemetry['snapshot']>['reports'] = [];
  for (let index = 0; index < 4; index++) {
    const request = ledger.begin('rural', index);
    for (let row = 0; row < 150; row++) { now++; request.event('data', { row, text: 'a'.repeat(400) }); }
    request.event('ready'); request.event('boundary-needed'); request.event('boundary-crossed');
    request.end('unloaded'); const original = ledger.snapshot().reports.find(r => r.id === request.id)!;
    now += 2001; ledger.frame(now - 2001, now);
    const selected = ledger.settledSnapshot(seen).reports;
    expect(selected).toHaveLength(1); expect(selected[0].records).toEqual(original.records);
    const headers = target.__transitionCapture.stage(selected);
    for (const header of headers) {
      seen.add(header.id); const records: typeof original.records = []; let done = false;
      while (!done) {
        const chunk = target.__transitionCapture.read(header.id);
        expect(chunk.offset).toBe(records.length);
        expect(chunk.records.length).toBeLessThanOrEqual(64);
        expect(Buffer.byteLength(JSON.stringify(chunk))).toBeLessThanOrEqual(32768);
        records.push(...chunk.records); done = chunk.done;
      }
      expect(records).toEqual(original.records); expect(records).toHaveLength(header.recordCount);
      persisted.push({ ...selected[0], records });
    }
  }
  expect(persisted).toHaveLength(4); expect(new Set(persisted.map(r => r.id)).size).toBe(4);
  expect(persisted.every(r => r.completeChronology && r.droppedRecords === 0)).toBe(true);
  expect(target.__transitionCapture.status().pendingReports).toBe(0);
  expect(ledger.snapshot()).toMatchObject({ drainedLifecycles: 0, dropped: { completedLifecycles: 2, records: 0 } });
});

test('runtime live readback equals full mutable state and remains detached from gameplay ownership', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?scene=m9&test=1&backend=webgl&diagnostics=tail');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 110000 });
  const comparison = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.freeze(true);
    const full = h.snapshot(), live = h.liveSnapshot();
    const { city: _city, bookmarks: _bookmarks, tail, ...mutable } = full;
    const { tail: liveTail, ...liveMutable } = live;
    const expectedTail = { maxIntervalMs: tail.maxIntervalMs, spans: tail.spans, dropped: tail.dropped,
      recentPeakGap: tail.frameGaps.reduce<typeof tail.frameGaps[number] | null>((peak, gap) => !peak || gap.intervalMs > peak.intervalMs ? gap : peak, null) };
    const mutableEqual = JSON.stringify(mutable) === JSON.stringify(liveMutable);
    const x = live.state.player.position.x, master = live.settings.audio.master;
    live.state.player.position.x = -99999; live.settings.audio.master = -1;
    const fresh = h.liveSnapshot();
    return { mutableEqual,
      tailEqual: JSON.stringify(expectedTail) === JSON.stringify(liveTail), keys: Object.keys(live),
      detached: fresh.state.player.position.x === x && fresh.settings.audio.master === master };
  });
  // Comparison strings must be calculated before mutating the returned copy.
  expect(comparison.tailEqual).toBe(true); expect(comparison.detached).toBe(true);
  expect(comparison.keys).not.toContain('city'); expect(comparison.keys).not.toContain('bookmarks');
  expect(comparison.mutableEqual).toBe(true);
});
