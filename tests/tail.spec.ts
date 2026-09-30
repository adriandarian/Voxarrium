import { test, expect } from '@playwright/test';
import { TailTelemetry } from '../src/diagnostics/tail';

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
