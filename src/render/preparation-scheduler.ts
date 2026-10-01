export interface PreparationWorkEvent {
  name: string; startMs: number; durationMs: number; budgetMs: number; yielded: boolean;
}
export interface PreparationSchedulerOptions {
  budgetMs?: number;
  now?: () => number;
  nextFrame?: (signal: AbortSignal) => Promise<void>;
  onWork?: (event: PreparationWorkEvent) => void;
}
export type PreparationJobs<T> = Generator<string | void, T, unknown>;

/** rAF work slices preserve a rendering/input opportunity between construction batches. */
export function nextPreparationFrame(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { cancelAnimationFrame(frame); reject(signal.reason ?? new DOMException('Obsolete preparation', 'AbortError')); };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason); else resolve();
    });
    signal.addEventListener('abort', abort, { once: true });
  });
}

export class PreparationScheduler {
  readonly budgetMs: number;
  private readonly now: () => number;
  private readonly nextFrame: (signal: AbortSignal) => Promise<void>;
  private readonly startedMs: number;
  private sliceStartedMs: number;
  private sliceJobs = 0;
  private jobs = 0;
  private yields = 0;
  private totalCpuMs = 0;
  private largestJobMs = 0;
  private oversizeJobs = 0;
  constructor(readonly signal: AbortSignal, private readonly options: PreparationSchedulerOptions = {}) {
    this.budgetMs = options.budgetMs ?? 3;
    if (!(this.budgetMs > 0) || this.budgetMs > 16) throw new Error('Preparation budget must be >0 and <=16ms.');
    this.now = options.now ?? (() => performance.now());
    this.nextFrame = options.nextFrame ?? nextPreparationFrame;
    this.startedMs = this.sliceStartedMs = this.now();
  }
  /** Also used by parent-owned renderer/collider work; no timer polling or background loop. */
  async yieldFrame() {
    this.signal.throwIfAborted(); this.yields++;
    await this.nextFrame(this.signal); this.signal.throwIfAborted();
    this.sliceStartedMs = this.now(); this.sliceJobs = 0;
  }
  async run<T>(name: string, iterator: PreparationJobs<T>): Promise<T> {
    let label = name;
    try {
      for (;;) {
        this.signal.throwIfAborted();
        const startMs = this.now();
        const step = iterator.next();
        const durationMs = Math.max(0, this.now() - startMs);
        this.jobs++; this.sliceJobs++; this.totalCpuMs += durationMs;
        this.largestJobMs = Math.max(this.largestJobMs, durationMs);
        this.oversizeJobs += Number(durationMs > this.budgetMs);
        const yielded = !step.done && (this.now() - this.sliceStartedMs >= this.budgetMs || this.sliceJobs >= 64);
        this.options.onWork?.({ name: label, startMs, durationMs, budgetMs: this.budgetMs, yielded });
        if (step.done) return step.value;
        label = typeof step.value === 'string' ? step.value : name;
        if (yielded) await this.yieldFrame();
      }
    } finally {
      // Execute generator finally blocks on cancellation/failure, including partial geometry cleanup.
      iterator.return(undefined as T);
    }
  }
  async job<T>(name: string, work: () => T): Promise<T> {
    return this.run(name, (function* () { const result = work(); yield; return result; })());
  }
  snapshot() {
    return { budgetMs: this.budgetMs, jobs: this.jobs, yields: this.yields, totalCpuMs: this.totalCpuMs,
      largestJobMs: this.largestJobMs, oversizeJobs: this.oversizeJobs,
      preparationDurationMs: Math.max(0, this.now() - this.startedMs) };
  }
}

/** Resident scene APIs and deterministic tests exhaust precisely the same authored jobs. */
export function finishPreparation<T>(iterator: PreparationJobs<T>): T {
  for (;;) { const step = iterator.next(); if (step.done) return step.value; }
}
