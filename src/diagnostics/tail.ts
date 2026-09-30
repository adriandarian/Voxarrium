/** Opt-in, bounded CPU/browser wall-time evidence. These records are never GPU timings. */
export interface TailRecord {
  name: string;
  startMs: number;
  durationMs: number;
  kind: 'event' | 'span' | 'longtask' | 'resource' | 'long-animation-frame';
  detail?: unknown;
}

interface SpanAggregate {
  count: number;
  totalMs: number;
  maxMs: number;
  failures: number;
}

interface FrameGap {
  startMs: number;
  endMs: number;
  intervalMs: number;
  callbackStartMs: number;
  rafTimestampAgeMs: number;
  previousCallbackStartMs: number;
  visibility: string;
  focused: boolean | null;
  nearbyRecords: TailRecord[];
}

export interface TailOptions {
  enabled?: boolean;
  now?: () => number;
  timeOrigin?: number;
  observe?: boolean;
  capacity?: number;
  longFrameMs?: number;
  slowSpanMs?: number;
}

class Ring<T> {
  private items: T[] = [];
  private next = 0;
  dropped = 0;
  constructor(readonly capacity: number) {}
  push(item: T) {
    if (this.items.length < this.capacity) this.items.push(item);
    else { this.items[this.next] = item; this.dropped++; }
    this.next = (this.next + 1) % this.capacity;
  }
  snapshot() {
    return this.items.length < this.capacity ? [...this.items] : [...this.items.slice(this.next), ...this.items.slice(0, this.next)];
  }
  reset() { this.items = []; this.next = 0; this.dropped = 0; }
}

// Telemetry must not keep a render object, an exception graph or an unbounded caller payload alive.
function boundedDetail(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value !== 'object') return String(value).slice(0, 80);
  if (depth >= 3 || seen.has(value)) return '[bounded]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 16).map(item => boundedDetail(item, depth + 1, seen));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 16)) result[key.slice(0, 80)] = boundedDetail(item, depth + 1, seen);
  return result;
}

function optedIn() {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('diagnostics') === 'tail';
}

export class TailTelemetry {
  readonly enabled: boolean;
  private disposed = false;
  private readonly now: () => number;
  private readonly timeOrigin: number;
  private readonly longFrameMs: number;
  private readonly slowSpanMs: number;
  private readonly records: Ring<TailRecord>;
  private readonly important: Ring<TailRecord>;
  private readonly gaps: Ring<FrameGap>;
  private readonly recent: Ring<TailRecord>;
  private aggregates: Record<string, SpanAggregate> = Object.create(null);
  private aggregateCount = 0;
  private captureEpoch = 0;
  private previousRaf: number | null = null;
  private previousCallback: number | null = null;
  private resetAtMs: number;
  private frameCount = 0;
  private maxIntervalMs = 0;
  private maxRafTimestampAgeMs = 0;
  private readonly observers: PerformanceObserver[] = [];
  private readonly removers: (() => void)[] = [];
  private readonly support: Record<string, string> = {};

  constructor(options: TailOptions = {}) {
    this.enabled = options.enabled ?? optedIn();
    this.now = options.now ?? (() => performance.now());
    this.timeOrigin = options.timeOrigin ?? performance.timeOrigin;
    this.longFrameMs = options.longFrameMs ?? 33.3;
    this.slowSpanMs = options.slowSpanMs ?? 4;
    const capacity = options.capacity ?? 1024;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error('Tail capacity must be an integer from 1 to 4096.');
    if (!(this.longFrameMs > 0) || !(this.slowSpanMs >= 0)) throw new Error('Tail thresholds must be positive/nonnegative.');
    this.records = new Ring(capacity);
    this.important = new Ring(Math.min(capacity, 256));
    this.gaps = new Ring(Math.min(capacity, 128));
    this.recent = new Ring(Math.min(capacity, 128));
    this.resetAtMs = this.now();
    if (this.enabled && options.observe !== false) this.installObservers();
  }

  private get active() { return this.enabled && !this.disposed; }

  event(name: string, detail?: unknown) {
    if (!this.active) return;
    this.record({ name: name.slice(0, 100), startMs: this.now(), durationMs: 0, kind: 'event', detail: boundedDetail(detail) });
  }

  span<T>(name: string, callback: () => T): T {
    if (!this.active) return callback();
    const start = this.now();
    const epoch = this.captureEpoch;
    let failed = true;
    try { const result = callback(); failed = false; return result; }
    finally { this.finishSpan(name, start, failed, epoch); }
  }

  async asyncSpan<T>(name: string, callback: () => Promise<T>): Promise<T> {
    if (!this.active) return callback();
    const start = this.now();
    const epoch = this.captureEpoch;
    let failed = true;
    try { const result = await callback(); failed = false; return result; }
    finally { this.finishSpan(name, start, failed, epoch); }
  }

  private finishSpan(name: string, startMs: number, failed: boolean, epoch: number) {
    if (!this.active || epoch !== this.captureEpoch) return;
    const durationMs = Math.max(0, this.now() - startMs);
    const label = name.slice(0, 100);
    const key = Object.hasOwn(this.aggregates, label) || this.aggregateCount < 64 ? label : '[other spans]';
    if (!Object.hasOwn(this.aggregates, key)) { this.aggregateCount++; this.aggregates[key] = { count: 0, totalMs: 0, maxMs: 0, failures: 0 }; }
    const stats = this.aggregates[key];
    stats.count++; stats.totalMs += durationMs; stats.maxMs = Math.max(stats.maxMs, durationMs); stats.failures += Number(failed);
    const record: TailRecord = { name: label, startMs, durationMs, kind: 'span', detail: { failed } };
    this.recent.push(record);
    if (durationMs >= this.slowSpanMs || failed) this.records.push(record);
  }

  /** now is the rAF-provided timestamp; callbackStart is performance.now() at actual dispatch. */
  frame(now: number, callbackStart = this.now()) {
    if (!this.active || !Number.isFinite(now) || !Number.isFinite(callbackStart)) return;
    this.frameCount++;
    const age = Math.max(0, callbackStart - now);
    this.maxRafTimestampAgeMs = Math.max(this.maxRafTimestampAgeMs, age);
    if (this.previousRaf !== null && now > this.previousRaf) {
      const intervalMs = now - this.previousRaf;
      this.maxIntervalMs = Math.max(this.maxIntervalMs, intervalMs);
      if (intervalMs > this.longFrameMs) {
        const gap: FrameGap = {
          startMs: this.previousRaf, endMs: now, intervalMs, callbackStartMs: callbackStart,
          rafTimestampAgeMs: age, previousCallbackStartMs: this.previousCallback!,
          visibility: typeof document === 'undefined' ? 'unavailable' : document.visibilityState,
          focused: typeof document === 'undefined' ? null : document.hasFocus(),
          nearbyRecords: this.recent.snapshot().filter(record => record.startMs + record.durationMs >= this.previousRaf! - 20 && record.startMs <= callbackStart).slice(-24),
        };
        this.gaps.push(gap);
      }
    }
    this.previousRaf = now;
    this.previousCallback = callbackStart;
  }

  private record(record: TailRecord) {
    if (record.startMs < this.resetAtMs) return;
    this.records.push(record);
    if (record.kind !== 'span') this.important.push(record);
    this.recent.push(record);
  }

  private consume(entries: PerformanceEntry[]) {
    if (!this.active) return;
    for (const entry of entries) {
      const data = entry as PerformanceEntry & Record<string, unknown>;
      const detail: Record<string, unknown> = {};
      if (entry.entryType === 'resource') {
        for (const key of ['initiatorType', 'fetchStart', 'requestStart', 'responseStart', 'responseEnd', 'transferSize', 'encodedBodySize', 'decodedBodySize']) detail[key] = data[key];
      } else if (entry.entryType === 'long-animation-frame') {
        for (const key of ['renderStart', 'styleAndLayoutStart', 'firstUIEventTimestamp', 'blockingDuration']) detail[key] = data[key];
        detail.scripts = Array.isArray(data.scripts) ? data.scripts.slice(0, 8).map(script => {
          const row = script as Record<string, unknown>;
          return Object.fromEntries(['startTime', 'duration', 'executionStart', 'forcedStyleAndLayoutDuration', 'invokerType', 'invoker', 'sourceURL', 'sourceFunctionName', 'sourceCharPosition'].map(key => [key, row[key]]));
        }) : [];
      } else if (entry.entryType === 'longtask') {
        detail.attribution = Array.isArray(data.attribution) ? data.attribution.slice(0, 8).map(item => {
          const row = item as Record<string, unknown>;
          return { name: row.name, containerType: row.containerType, containerSrc: row.containerSrc };
        }) : [];
      } else continue;
      this.record({ name: entry.name.slice(0, 500), startMs: entry.startTime, durationMs: entry.duration, kind: entry.entryType as TailRecord['kind'], detail: boundedDetail(detail) });
    }
  }

  private installObservers() {
    for (const type of ['longtask', 'resource', 'long-animation-frame']) {
      if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes.includes(type)) {
        this.support[type] = 'unsupported'; continue;
      }
      try {
        const observer = new PerformanceObserver(list => this.consume(list.getEntries()));
        observer.observe({ type, buffered: true });
        this.observers.push(observer);
        this.support[type] = 'observed';
      } catch (error) { this.support[type] = `unavailable: ${String(error).slice(0, 200)}`; }
    }
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const visibility = () => this.event('document.visibility', { visibility: document.visibilityState, focused: document.hasFocus() });
      const focus = () => this.event('window.focus');
      const blur = () => this.event('window.blur');
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('focus', focus);
      window.addEventListener('blur', blur);
      this.removers.push(() => document.removeEventListener('visibilitychange', visibility), () => window.removeEventListener('focus', focus), () => window.removeEventListener('blur', blur));
      visibility();
    }
  }

  reset() {
    for (const observer of this.observers) observer.takeRecords();
    this.records.reset(); this.important.reset(); this.recent.reset(); this.gaps.reset();
    this.aggregates = Object.create(null); this.aggregateCount = 0; this.captureEpoch++;
    this.previousRaf = null; this.previousCallback = null;
    this.frameCount = 0; this.maxIntervalMs = 0; this.maxRafTimestampAgeMs = 0;
    this.resetAtMs = this.now();
  }

  snapshot() {
    // Observers can deliver after the long rAF gap. Join retained observations when exporting.
    for (const observer of this.observers) this.consume(observer.takeRecords());
    const records = this.records.snapshot();
    const importantRecords = this.important.snapshot();
    const retained = [...new Set([...records, ...importantRecords])].sort((a, b) => a.startMs - b.startMs);
    return {
      enabled: this.enabled, disposed: this.disposed, timeOrigin: this.timeOrigin,
      resetAtMs: this.resetAtMs, capturedAtMs: this.now(), frameCount: this.frameCount,
      maxIntervalMs: this.maxIntervalMs, maxRafTimestampAgeMs: this.maxRafTimestampAgeMs,
      support: { ...this.support }, thresholds: { longFrameMs: this.longFrameMs, slowSpanMs: this.slowSpanMs },
      capacity: { records: this.records.capacity, importantRecords: this.important.capacity, frameGaps: this.gaps.capacity, nearbyRecordsPerGap: 24, spanNames: 65 },
      dropped: { records: this.records.dropped, importantRecords: this.important.dropped, frameGaps: this.gaps.dropped },
      spans: structuredClone(this.aggregates), records: structuredClone(records), importantRecords: structuredClone(importantRecords),
      frameGaps: structuredClone(this.gaps.snapshot().map(gap => ({ ...gap,
        overlappingRecords: retained.filter(record => record.startMs <= gap.callbackStartMs && record.startMs + record.durationMs >= gap.startMs).slice(-32),
      }))),
      limitations: [
        'All durations are CPU/browser wall time; async spans include waiting. Nested spans overlap and must not be summed.',
        'rAF timestamp age is a browser dispatch signal, not presentation or GPU execution time.',
        'PerformanceObserver long tasks and long animation frames have browser-defined thresholds and incomplete attribution.',
        'Resource timing measures fetch/decode-transfer milestones, not texture upload or GPU residency.',
        'GPU timestamp queries, VRAM and OS scheduler/context-switch data are not collected.',
        'Opt-in instrumentation and browser tracing add overhead; fixed rings report dropped records.',
      ],
    };
  }

  dispose() {
    if (this.disposed) return;
    for (const observer of this.observers) observer.disconnect();
    this.observers.length = 0;
    for (const remove of this.removers) remove();
    this.removers.length = 0;
    this.disposed = true;
  }
}

export const tail = new TailTelemetry();
