import { expect, test } from '@playwright/test';
import { FixedClock } from '../src/simulation/clock';

test('tab suspension and long frames cannot accumulate unbounded physics work', () => {
  const clock = new FixedClock();
  let ticks = 0;
  const step = () => ticks++;
  clock.advance(0, false, step);
  clock.advance(1_000 / 60, false, step);
  expect(ticks).toBe(1);
  clock.advance(60_000, false, step);
  expect(ticks).toBe(7);
  clock.advance(120_000, true, step);
  clock.advance(120_000 + 1_000 / 60, false, step);
  expect(ticks).toBe(8);
  clock.reset();
  clock.advance(1_000_000, false, step);
  expect(ticks).toBe(8);
});
