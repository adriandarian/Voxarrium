import { FIXED_DT } from './types';

/** A suspended tab can never inject seconds of accumulated motion on return. */
export class FixedClock {
  private previous: number | undefined;
  private accumulator = 0;
  advance(nowMs: number, suspended: boolean, step: () => void): number {
    if (this.previous === undefined || suspended) {
      this.previous = nowMs;
      this.accumulator = 0;
      return 0;
    }
    const delta = Math.min(Math.max((nowMs - this.previous) / 1000, 0), 0.1);
    this.previous = nowMs;
    this.accumulator += delta;
    let count = 0;
    while (this.accumulator + 1e-10 >= FIXED_DT && count < 6) {
      step();
      this.accumulator -= FIXED_DT;
      count++;
    }
    return Math.max(0, Math.min(1, this.accumulator / FIXED_DT));
  }
  reset(): void { this.previous = undefined; this.accumulator = 0; }
}
