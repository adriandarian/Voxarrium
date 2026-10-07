/** Per-request chronological CPU/browser wall evidence, independent of the noisy tail ring. */
export interface TransitionRecord {
  sequence: number;
  kind: 'begin' | 'event' | 'span-begin' | 'span-end' | 'end';
  name: string;
  timeMs: number;
  spanId?: number;
  startMs?: number;
  durationMs?: number;
  detail?: unknown;
}

export interface TransitionHandle {
  readonly id: string;
  readonly areaId: string;
  readonly requestId: string | number;
  event(name: string, detail?: unknown): void;
  span<T>(name: string, callback: () => T, detail?: unknown): T;
  asyncSpan<T>(name: string, callback: () => Promise<T>, detail?: unknown): Promise<T>;
  work(event: { name: string; startMs: number; durationMs: number; budgetMs: number; yielded: boolean }): void;
  end(outcome: 'active' | 'unloaded' | 'cancelled' | 'failed', detail?: unknown): void;
}

/** Do not keep render objects, exception graphs or arbitrary caller payloads alive. */
export function boundedDetail(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value !== 'object') return String(value).slice(0, 80);
  if (depth >= 3 || seen.has(value)) return '[bounded]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 16).map(item => boundedDetail(item, depth + 1, seen));
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value).slice(0, 16)) result[key.slice(0, 80)] = boundedDetail(item, depth + 1, seen);
  return result;
}

interface Lifecycle {
  id: string;
  areaId: string;
  requestId: string | number;
  startedAtMs: number;
  endedAtMs: number | null;
  outcome: string | null;
  records: TransitionRecord[];
  droppedRecords: number;
  nextSequence: number;
  nextSpan: number;
  pendingSpans: number;
  readyAtMs: number | null;
  boundaryAtMs: number | null;
  boundaryNeededAtMs: number | null;
  activationAtMs: number | null;
  firstVisibleAtMs: number | null;
  frameCount: number;
  maximumFrameIntervalMs: number;
  preparationFrameMaximumMs: number;
  activationFrameMaximumMs: number;
  largestSchedulerJob: { name: string; startMs: number; durationMs: number; detail?: unknown } | null;
  totalSchedulerJobs: number;
  totalSchedulerCpuMs: number;
  preparationDurationMs: number | null;
}

export interface TransitionOptions {
  enabled: boolean;
  now: () => number;
  timeOrigin: number;
  maxCompleted?: number;
  maxActive?: number;
  maxRecordsPerTransition?: number;
}

export class TransitionTelemetry {
  private readonly active = new Map<string, Lifecycle>();
  private readonly completed: Lifecycle[] = [];
  private readonly maxCompleted: number;
  private readonly maxActive: number;
  private readonly maxRecords: number;
  private nextId = 0;
  private evictedCompleted = 0;
  private rejectedRequests = 0;
  private drainedLifecycles = 0;
  private disposed = false;
  private readonly activationWindowMs = 2000;
  private lastFrameToMs = -Infinity;

  constructor(private readonly options: TransitionOptions) {
    this.maxCompleted = options.maxCompleted ?? 48;
    this.maxActive = options.maxActive ?? 8;
    this.maxRecords = options.maxRecordsPerTransition ?? 8192;
    for (const [name, value, maximum] of [['completed', this.maxCompleted, 128], ['active', this.maxActive, 32], ['records', this.maxRecords, 8192]] as const) {
      if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`Transition ${name} capacity must be an integer from 1 to ${maximum}.`);
    }
  }

  begin(areaId: string, requestId: string | number, detail?: unknown): TransitionHandle {
    const id = `${areaId.slice(0, 80)}:${String(requestId).slice(0, 80)}:${++this.nextId}`;
    const enabled = this.options.enabled && !this.disposed;
    const lifecycle: Lifecycle | null = enabled && this.active.size < this.maxActive ? {
      id, areaId: areaId.slice(0, 80), requestId: typeof requestId === 'string' ? requestId.slice(0, 80) : requestId,
      startedAtMs: this.options.now(), endedAtMs: null, outcome: null, records: [], droppedRecords: 0,
      nextSequence: 0, nextSpan: 0, pendingSpans: 0, readyAtMs: null, boundaryAtMs: null, boundaryNeededAtMs: null, activationAtMs: null,
      firstVisibleAtMs: null, frameCount: 0, maximumFrameIntervalMs: 0, preparationFrameMaximumMs: 0,
      activationFrameMaximumMs: 0, largestSchedulerJob: null, totalSchedulerJobs: 0, totalSchedulerCpuMs: 0, preparationDurationMs: null,
    } : null;
    if (enabled && !lifecycle) this.rejectedRequests++;
    if (lifecycle) {
      this.active.set(id, lifecycle);
      this.append(lifecycle, { kind: 'begin', name: 'request-received', timeMs: lifecycle.startedAtMs, detail: boundedDetail(detail) });
    }
    const writable = () => lifecycle !== null && lifecycle.endedAtMs === null && !this.disposed;
    const startSpan = (name: string, payload?: unknown) => {
      if (!writable()) return null;
      const span = { spanId: ++lifecycle!.nextSpan, name: name.slice(0, 100), startMs: this.options.now(), detail: boundedDetail(payload) };
      lifecycle!.pendingSpans++;
      this.append(lifecycle!, { kind: 'span-begin', name: span.name, timeMs: span.startMs, spanId: span.spanId, detail: span.detail });
      return span;
    };
    const finishSpan = (span: ReturnType<typeof startSpan>, failed: boolean) => {
      if (!span || !lifecycle || this.disposed) return;
      lifecycle.pendingSpans--;
      const timeMs = this.options.now(), durationMs = Math.max(0, timeMs - span.startMs);
      this.append(lifecycle!, { kind: 'span-end', name: span.name, timeMs, startMs: span.startMs, durationMs, spanId: span.spanId,
        detail: { failed, context: span.detail } });
      if (span.name === 'scheduler-job' && (!lifecycle!.largestSchedulerJob || durationMs > lifecycle!.largestSchedulerJob.durationMs)) {
        lifecycle!.largestSchedulerJob = { name: span.name, startMs: span.startMs, durationMs, detail: span.detail };
      }
      if (span.name === 'preparation') lifecycle!.preparationDurationMs = durationMs;
    };
    return {
      id, areaId: areaId.slice(0, 80), requestId,
      event: (name, payload) => {
        if (!writable()) return;
        const timeMs = this.options.now();
        if (name === 'ready') lifecycle!.readyAtMs ??= timeMs;
        if (name === 'boundary-crossed') lifecycle!.boundaryAtMs ??= timeMs;
        if (name === 'boundary-needed') lifecycle!.boundaryNeededAtMs ??= timeMs;
        if (name === 'activation-complete') lifecycle!.activationAtMs ??= timeMs;
        if (name === 'first-visible-frame') lifecycle!.firstVisibleAtMs ??= timeMs;
        this.append(lifecycle!, { kind: 'event', name: name.slice(0, 100), timeMs, detail: boundedDetail(payload) });
      },
      span: (name, callback, payload) => {
        const span = startSpan(name, payload);
        let failed = true;
        try { const result = callback(); failed = false; return result; }
        finally { finishSpan(span, failed); }
      },
      asyncSpan: async (name, callback, payload) => {
        const span = startSpan(name, payload);
        let failed = true;
        try { const result = await callback(); failed = false; return result; }
        finally { finishSpan(span, failed); }
      },
      work: event => {
        if (!writable() || !Number.isFinite(event.startMs) || !Number.isFinite(event.durationMs) || event.durationMs < 0) return;
        const spanId = ++lifecycle!.nextSpan;
        const detail = boundedDetail({ name: event.name, budgetMs: event.budgetMs, yielded: event.yielded });
        const previous = lifecycle!.records.at(-1), begin = lifecycle!.records.at(-2);
        const batch = previous?.detail as { failed: boolean; context: { name: string; labels: string[]; unlistedLabelJobs: number;
          budgetMs: number; yielded: boolean; jobs: number; cpuTotalMs: number; largestJobMs: number } } | undefined;
        if (previous?.name === 'scheduler-job' && previous.kind === 'span-end' && begin?.kind === 'span-begin' &&
          batch && !batch.context.yielded && batch.context.jobs > 0 && event.startMs >= previous.timeMs - .000001 && event.startMs - previous.timeMs < 5) {
          batch.context.jobs++; batch.context.cpuTotalMs += event.durationMs;
          batch.context.largestJobMs = Math.max(batch.context.largestJobMs, event.durationMs); batch.context.yielded = event.yielded;
          if (!batch.context.labels.includes(event.name.slice(0, 100))) {
            batch.context.name = '[mixed jobs]';
            if (batch.context.labels.length < 16) batch.context.labels.push(event.name.slice(0, 100)); else batch.context.unlistedLabelJobs++;
          }
          begin.detail = { ...batch.context }; previous!.timeMs = event.startMs + event.durationMs;
          previous!.durationMs = previous!.timeMs - begin.timeMs;
        } else {
          const context = { name: event.name.slice(0, 100), budgetMs: event.budgetMs, yielded: event.yielded,
            labels: [event.name.slice(0, 100)], unlistedLabelJobs: 0, jobs: 1, cpuTotalMs: event.durationMs, largestJobMs: event.durationMs };
          this.append(lifecycle!, { kind: 'span-begin', name: 'scheduler-job', timeMs: event.startMs, spanId, detail: context });
          this.append(lifecycle!, { kind: 'span-end', name: 'scheduler-job', timeMs: event.startMs + event.durationMs,
            spanId, startMs: event.startMs, durationMs: event.durationMs, detail: { failed: false, context: { ...context } } });
        }
        lifecycle!.totalSchedulerJobs++; lifecycle!.totalSchedulerCpuMs += event.durationMs;
        if (!lifecycle!.largestSchedulerJob || event.durationMs > lifecycle!.largestSchedulerJob.durationMs) {
          lifecycle!.largestSchedulerJob = { name: 'scheduler-job', startMs: event.startMs, durationMs: event.durationMs, detail };
        }
      },
      end: (outcome, payload) => {
        if (!writable()) return;
        lifecycle!.endedAtMs = this.options.now(); lifecycle!.outcome = outcome;
        this.append(lifecycle!, { kind: 'end', name: outcome, timeMs: lifecycle!.endedAtMs, detail: boundedDetail(payload) });
        this.active.delete(id); this.completed.push(lifecycle!);
        if (this.completed.length > this.maxCompleted) { this.completed.shift(); this.evictedCompleted++; }
      },
    };
  }

  private append(lifecycle: Lifecycle, record: Omit<TransitionRecord, 'sequence'>) {
    const row = { ...record, sequence: ++lifecycle.nextSequence };
    if (lifecycle.records.length < this.maxRecords) lifecycle.records.push(row);
    else {
      // Prefer discarding detailed work batches rather than phase/milestone evidence.
      const jobIndex = lifecycle.records.findIndex(item => item.name === 'scheduler-job');
      const index = jobIndex >= 0 ? jobIndex : this.maxRecords === 1 ? 0 : 1;
      lifecycle.records.splice(index, 1); lifecycle.records.push(row); lifecycle.droppedRecords++;
    }
  }

  frame(fromMs: number, toMs: number) {
    if (!this.options.enabled || this.disposed || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return;
    this.lastFrameToMs = toMs;
    const interval = toMs - fromMs;
    for (const lifecycle of [...this.active.values(), ...this.completed]) {
      if (toMs < lifecycle.startedAtMs || fromMs > (lifecycle.endedAtMs ?? Infinity) + this.activationWindowMs) continue;
      lifecycle.frameCount++; lifecycle.maximumFrameIntervalMs = Math.max(lifecycle.maximumFrameIntervalMs, interval);
      if (fromMs <= (lifecycle.readyAtMs ?? Infinity)) lifecycle.preparationFrameMaximumMs = Math.max(lifecycle.preparationFrameMaximumMs, interval);
      if (lifecycle.activationAtMs !== null && toMs >= lifecycle.activationAtMs && fromMs <= lifecycle.activationAtMs + this.activationWindowMs) {
        lifecycle.activationFrameMaximumMs = Math.max(lifecycle.activationFrameMaximumMs, interval);
      }
    }
  }

  snapshot() {
    return this.snapshotLifecycles([...this.completed, ...this.active.values()]);
  }

  /** Copy each settled request once for capture, without copying the previous
   * ledger or releasing any live telemetry. A delayed frame may still overlap
   * the window after wall time passes it, so require a processed rAF beyond it. */
  settledSnapshot(excludedIds: ReadonlySet<string>) {
    return this.snapshotLifecycles(this.completed.filter(lifecycle => lifecycle.pendingSpans === 0 &&
      !excludedIds.has(lifecycle.id) && this.lastFrameToMs > lifecycle.endedAtMs! + this.activationWindowMs));
  }

  private snapshotLifecycles(lifecycles: Lifecycle[]) {
    const reports = lifecycles.sort((a, b) => a.startedAtMs - b.startedAtMs).map(lifecycle => {
      const { nextSequence: _sequence, nextSpan: _span, ...report } = lifecycle;
      return { ...report, completeChronology: lifecycle.droppedRecords === 0,
        requestToReadyMs: lifecycle.readyAtMs === null ? null : lifecycle.readyAtMs - lifecycle.startedAtMs,
        preparationDurationMs: lifecycle.preparationDurationMs ?? (lifecycle.readyAtMs === null ? null : lifecycle.readyAtMs - lifecycle.startedAtMs),
        readyBeforeBoundary: lifecycle.readyAtMs === null || lifecycle.boundaryAtMs === null ? null : lifecycle.readyAtMs <= lifecycle.boundaryAtMs,
        readyLeadBeforeBoundaryMs: lifecycle.readyAtMs === null || lifecycle.boundaryAtMs === null ? null : lifecycle.boundaryAtMs - lifecycle.readyAtMs,
        readyBeforeBoundaryNeeded: lifecycle.readyAtMs === null || lifecycle.boundaryNeededAtMs === null ? null : lifecycle.readyAtMs <= lifecycle.boundaryNeededAtMs,
        readyLeadBeforeBoundaryNeededMs: lifecycle.readyAtMs === null || lifecycle.boundaryNeededAtMs === null ? null : lifecycle.boundaryNeededAtMs - lifecycle.readyAtMs,
        records: [...lifecycle.records].sort((a, b) => a.timeMs - b.timeMs || a.sequence - b.sequence),
      };
    });
    return structuredClone({ enabled: this.options.enabled, timeOrigin: this.options.timeOrigin, reports,
      capacity: { active: this.maxActive, completed: this.maxCompleted, recordsPerTransition: this.maxRecords },
      drainedLifecycles: this.drainedLifecycles,
      dropped: { completedLifecycles: this.evictedCompleted, rejectedRequests: this.rejectedRequests,
        records: [...this.completed, ...this.active.values()].reduce((total, report) => total + report.droppedRecords, 0) },
      activationWindowMs: this.activationWindowMs,
      limitations: [
        'Chronology records request-owned CPU/browser wall spans. Async spans include waiting; nested spans overlap.',
        'rAF intervals can overlap multiple requests. Request-lifetime maxima include residence; preparation and 2000 ms activation maxima are reported separately.',
        'readyBeforeBoundary is null until both authored milestones are observed; first-visible-frame means a render submission, not physical presentation.',
        'Complete ended requests are evicted as units. An overflowing individual request is explicitly incomplete; telemetry never blocks gameplay.',
        'Small scheduler jobs within a yield slice are retained as one timestamped batch with job count, CPU sum, maximum individual duration and at most 16 labels.',
        'General tail reset preserves transition lifecycles. GPU execution, native shader compilation and OS scheduling attribution require separate evidence.',
      ],
    });
  }

  /** The capture driver persists each complete report outside the page before
   * endpoint heap measurement. Keep unfinished requests and their late spans. */
  discardExportedCompleted() {
    for (let index = this.completed.length - 1; index >= 0; index--) {
      if (this.completed[index]!.pendingSpans === 0) { this.completed.splice(index, 1); this.drainedLifecycles++; }
    }
  }

  dispose() { this.disposed = true; }
}
