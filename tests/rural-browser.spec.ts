import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const blockout = process.env.VOXARRIUM_STAGE === 'blockout';
const directory = process.env.VOXARRIUM_CAPTURE_DIR ?? `artifacts/m2/${blockout ? 'blockout' : 'final'}`;
mkdirSync(directory, { recursive: true });

for (const mode of ['third-person', 'first-person'] as const) {
  test(`M2 continuous route from river crossing to cottage and crop terrace: ${mode}`, async ({ page }) => {
    await page.goto(`/?scene=m2&test=1${blockout ? '&stage=blockout' : ''}`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await page.evaluate(mode => {
      const h = window.__VOXARRIUM__!;
      h.bookmark('bridge', mode); h.teleport({ x: -2, y: 0.03, z: 29 });
      h.step(30);
    }, mode);
    const records = [];
    for (const [x, z, y] of [
      [-2, 10.5, 0], [-7, 10.5, 0], [-7, 1.4, 4], [0, 1, 4],
      [4.95, 1, 4], [4.95, -14, 4], [-7, -14, 4], [-14, -12.8, 4],
      [-14, -22.5, 7.4], [-4, -24, 7.4],
    ] as const) {
      const record = await page.evaluate(({ x, z }) => {
        const h = window.__VOXARRIUM__!;
        let steps = 0;
        for (; steps < 1800; steps += 8) {
          const p = h.snapshot().state.player.position;
          if (Math.hypot(x - p.x, z - p.z) < 0.33) break;
          h.look(Math.atan2(p.x - x, p.z - z), -0.1);
          h.step(8, { forward: 1 });
        }
        h.step(25);
        return { target: { x, z }, steps, ...h.snapshot() };
      }, { x, z });
      expect(record.steps, `reach ${x},${z}`).toBeLessThan(1800);
      expect(record.state.player.position.y).toBeCloseTo(y + 0.015, 1);
      expect(record.state.player.grounded).toBe(true);
      expect(record.state.resets).toBe(1); // one deliberate initial teleport only
      records.push(record);
    }
    await page.screenshot({ path: `${directory}/route-${mode}-crop.png` });
    writeFileSync(`${directory}/route-${mode}.json`, JSON.stringify(records, null, 2));
  });
}

test('evidence: M2 three-camera captures and initialized performance', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?scene=m2&test=1${blockout ? '&stage=blockout' : ''}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  const states: Record<string, unknown> = {};
  for (const [name, point, mode] of [
    ['eagle-eye', 'spawn', 'eagle-eye'],
    ['third-person', 'spawn', 'third-person'],
    ['first-person', 'cottageFront', 'first-person'],
    ['cottage-rear', 'cottageRear', 'third-person'],
    ['cottage-west', 'cottageWest', 'first-person'],
    ['cottage-east', 'cottageEast', 'first-person'],
    ['bridge', 'bridge', 'third-person'],
    ['riverbank', 'bank', 'first-person'],
    ['garden', 'garden', 'third-person'],
    ['stairs', 'stairs', 'third-person'],
  ] as const) {
    await page.setViewportSize(name === 'eagle-eye' ? { width: 900, height: 1200 } : { width: 1440, height: 900 });
    await page.evaluate(({ point, mode }) => window.__VOXARRIUM__!.bookmark(point, mode), { point, mode });
    await page.screenshot({ path: `${directory}/${name}.png` });
    states[name] = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
    if (name === 'eagle-eye') {
      const clean = await page.addStyleTag({ content: '.identity,.backend-badge,.hud-bottom,#diagnostics,#crosshair {visibility:hidden}' });
      await page.screenshot({ path: `${directory}/eagle-eye-clean.png` });
      await clean.evaluate(node => node.parentNode?.removeChild(node));
    }
  }
  await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('bank', 'first-person'); h.look(Math.PI * 0.73, -0.3);
  });
  const waterStyle = await page.addStyleTag({ content: '.identity,.backend-badge,.hud-bottom,#diagnostics,#crosshair {visibility:hidden}' });
  for (const [name, frames] of [['water-time-0', 0], ['water-time-6', 360]] as const) {
    await page.evaluate(frames => window.__VOXARRIUM__!.step(frames), frames);
    await page.screenshot({ path: `${directory}/${name}.png` });
    states[name] = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  }
  await waterStyle.evaluate(node => node.parentNode?.removeChild(node));
  await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('spawn'); h.freeze(false); h.resetTimings();
  });
  await page.waitForFunction(() => window.__VOXARRIUM__!.snapshot().timing.sampleCount >= 500, undefined, { timeout: 45_000 });
  const report = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  expect(report.state.sceneId).toBe('m2-rural-96m');
  expect(report.facts.assetReady && report.facts.shadersReady).toBe(true);
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/capture-states.json`, JSON.stringify(states, null, 2));
  writeFileSync(`${directory}/performance-${process.env.VOXARRIUM_HEADED === '1' ? 'headed' : 'headless'}.json`, JSON.stringify({
    measuredAt: new Date().toISOString(), browserVersion: browser.version(),
    scope: 'M2 idle third-person spawn after warmup; rAF wall-clock intervals, not GPU time; local dev server and browser automation active.',
    headed: process.env.VOXARRIUM_HEADED === '1', ...report, errors,
  }, null, 2));
});

test('M2 explicit WebGL fallback renders the art and crosses the bridge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?scene=m2&test=1&backend=webgl${blockout ? '&stage=blockout' : ''}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  const result = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('bridge', 'first-person');
    h.step(460, { forward: 1 }); return h.snapshot();
  });
  expect(result.facts.backend).toBe('WebGL2');
  expect(result.state.player.position.z).toBeGreaterThan(28);
  expect(result.state.player.grounded).toBe(true);
  expect(result.state.resets).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `${directory}/webgl-fallback.png` });
  writeFileSync(`${directory}/webgl-fallback.json`, JSON.stringify({ ...result, errors }, null, 2));
});
