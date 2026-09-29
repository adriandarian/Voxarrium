/** Wall-clock frame intervals, not GPU execution time. Feed only active frames. */
export class FrameTimings {
  private samples: number[] = [];
  private next = 0;
  constructor(private readonly capacity = 600) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Frame timing capacity must be a positive integer.');
  }

  record(deltaMs: number) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    if (this.samples.length < this.capacity) this.samples.push(deltaMs);
    else this.samples[this.next] = deltaMs;
    this.next = (this.next + 1) % this.capacity;
  }

  reset() { this.samples = []; this.next = 0; }

  snapshot() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const count = sorted.length;
    const mean = count ? sorted.reduce((sum, value) => sum + value, 0) / count : 0;
    const percentile = (fraction: number) => count ? sorted[Math.max(0, Math.ceil(count * fraction) - 1)] : 0;
    return {
      sampleCount: count,
      windowCapacity: this.capacity,
      fps: mean > 0 ? 1000 / mean : 0,
      meanFrameMs: mean,
      medianFrameMs: percentile(0.5),
      p95FrameMs: percentile(0.95),
      maxFrameMs: count ? sorted[count - 1] : 0,
      gpuTiming: 'not measured',
      source: 'requestAnimationFrame wall-clock intervals',
    };
  }
}
