import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DISTRICT_ROUTE } from '../src/simulation/district-layout';
import type { Page } from '@playwright/test';
const directory = process.env.VOXARRIUM_DISTRICT_CAPTURE_DIR ?? 'artifacts/m4/final';
mkdirSync(directory, { recursive: true });
async function ready(page: Page, backend = '') {
  await page.goto(`/?test=1${backend}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  (page as Page & { districtErrors: string[] }).districtErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { districtErrors: string[] }).districtErrors).toEqual([]);
});

for (const mode of ['third-person', 'first-person'] as const) {
  test(`M4 full connected district walking circuit in ${mode}`, async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page);
    await page.evaluate(({ start, mode }) => {
      const h = window.__VOXARRIUM__!; h.bookmark('ruralEdge', mode);
      h.teleport({ ...start, y: start.y + 0.04 }); h.step(30);
    }, { start: DISTRICT_ROUTE[0]!, mode });
    const records = [];
    for (const target of DISTRICT_ROUTE.slice(1)) {
      const record = await page.evaluate(target => {
        const h = window.__VOXARRIUM__!;
        let frames = 0;
        for (; frames < 2100; frames += 4) {
          const p = h.snapshot().state.player.position;
          if (Math.hypot(target.x - p.x, target.z - p.z) < 0.18) break;
          h.look(Math.atan2(p.x - target.x, p.z - target.z), -0.08);
          h.step(4, { forward: 1 });
        }
        h.step(24);
        return { target, frames, ...h.snapshot() };
      }, target);
      expect(record.frames, JSON.stringify(target)).toBeLessThan(2100);
      expect(Math.hypot(record.state.player.position.x - target.x, record.state.player.position.z - target.z)).toBeLessThan(0.26);
      expect(record.state.player.position.y).toBeGreaterThan(target.y - 0.03);
      expect(record.state.player.position.y).toBeLessThan(target.y + 0.22);
      expect(record.state.player.grounded).toBe(true);
      expect(record.state.resets).toBe(1);
      expect(record.state.population).toHaveLength(42);
      records.push(record);
    }
    writeFileSync(`${directory}/route-${mode}.json`, JSON.stringify(records, null, 2));
    await page.screenshot({ path: `${directory}/route-${mode}-end.png` });
  });
}

test('M4 real controls, local dialogue, district audio, shelter and recovery', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  expect((await page.evaluate(() => window.__VOXARRIUM__!.snapshot())).audio.status).toBe('awaiting-gesture');
  await page.locator('#start').click();
  await expect(page.locator('#menu')).toBeHidden();
  await page.waitForFunction(() => window.__VOXARRIUM__!.snapshot().audio.status === 'running');
  const before = await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.player.position);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.player.position);
    return Math.hypot(p.x - before.x, p.z - before.z);
  }).toBeGreaterThan(0.8);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyV');
  expect(await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.camera.mode)).toBe('first-person');
  await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('market', 'first-person');
    const npc = h.snapshot().state.population.find(n => n.id === 'district.local.08')!;
    h.teleport({ ...npc.position, z: npc.position.z + 1.1 }); h.look(0, 0.03); h.step(12);
  });
  await page.keyboard.press('KeyF');
  await expect(page.locator('#dialogue')).toBeVisible();
  expect(await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.interaction?.id)).toContain('district.local.');
  await page.keyboard.press('KeyF');
  const clear = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('market'); h.environment('clear', 'day', true); h.step(180); return h.snapshot();
  });
  await page.waitForTimeout(250);
  const audio = await page.evaluate(() => window.__VOXARRIUM__!.snapshot().audio);
  expect(audio.activeLoops).toBe(5);
  expect(audio.levels.market).toBeGreaterThan(0);
  expect(audio.outputRms).toBeGreaterThan(0);
  const rain = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.environment('rain', 'night', true); h.resetPopulation();
    h.step(3600); h.step(3600); h.step(1800); return h.snapshot();
  });
  expect(rain.state.population.every(n => n.mode === 'sheltered')).toBe(true);
  expect(rain.render.living.environment!.rainDrops).toBeGreaterThan(0);
  expect(rain.render.living.environment!.shadowCastingLocalLights).toBe(0);
  expect(rain.audio.levels.market).toBeLessThan(audio.levels.market * 0.1);
  const identities = rain.state.population.map(n => n.id);
  await page.keyboard.press('KeyR');
  const recovery = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  expect(recovery.state.population.map(n => n.id)).toEqual(identities);
  expect(recovery.state.environment!.weather).toBe('rain');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.__VOXARRIUM__!.snapshot())).audio.outputRms).toBe(0);
  writeFileSync(`${directory}/living-verification.json`, JSON.stringify({ clear, audio, rain, recovery }, null, 2));
});

test('evidence: M4 district, streets, doorway, backs, plaza, canal, dusk, night and rain', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await ready(page);
  const states: Record<string, unknown> = {};
  const captures = [
    ['eagle-eye', 'market', 'eagle-eye', 'clear', 'day'],
    ['primary-street', 'primaryStreet', 'third-person', 'clear', 'day'],
    ['market', 'market', 'third-person', 'clear', 'day'],
    ['canal-bridge', 'canal', 'third-person', 'clear', 'day'],
    ['south-quay', 'southQuay', 'first-person', 'clear', 'day'],
    ['guild-hall', 'civic', 'third-person', 'clear', 'day'],
    ['dusk', 'market', 'third-person', 'clear', 'dusk'],
    ['night', 'primaryStreet', 'third-person', 'clear', 'night'],
    ['night-market', 'market', 'first-person', 'clear', 'night'],
    ['rain', 'primaryStreet', 'third-person', 'rain', 'day'],
    ['rain-market', 'market', 'first-person', 'rain', 'dusk'],
  ] as const;
  const clean = await page.addStyleTag({ content: '.identity,.backend-badge,.hud-bottom,#diagnostics,#crosshair {visibility:hidden}' });
  for (const [name, point, mode, weather, time] of captures) {
    await page.setViewportSize(name === 'eagle-eye' ? { width: 1600, height: 1100 } : { width: 1440, height: 900 });
    await page.evaluate(({ point, mode, weather, time }) => {
      const h = window.__VOXARRIUM__!; h.bookmark(point, mode); h.environment(weather, time, true); h.step(240);
      if (point === 'civic') { h.teleport({ x: 130, y: 4.04, z: -18 }); h.look(0, 0.2); h.step(30); }
    }, { point, mode, weather, time });
    await page.screenshot({ path: `${directory}/${name}.png` });
    states[name] = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  }
  for (const [name, x, z, yaw, pitch] of [
    ['first-person-alley', 60, -33, 0, 0.08],
    ['first-person-doorway', 58, -14.5, 0, 0.12],
    ['building-backs', 71, -46, Math.PI, 0.2],
    ['building-side', 112, -26.7, 2.268, 0.12],
    ['rural-connection', 42, -10, -Math.PI / 2, 0],
  ] as const) {
    await page.evaluate(({ x, z, yaw, pitch }) => {
      const h = window.__VOXARRIUM__!; h.environment('clear', 'day', true); h.bookmark('market', 'first-person');
      h.teleport({ x, y: 4.04, z }); h.look(yaw, pitch); h.step(30);
    }, { x, z, yaw, pitch });
    await page.screenshot({ path: `${directory}/${name}.png` });
    states[name] = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  }
  await clean.evaluate(el => el.parentNode?.removeChild(el));
  writeFileSync(`${directory}/capture-states.json`, JSON.stringify({ browserVersion: browser.version(), headed: process.env.VOXARRIUM_HEADED === '1', states }, null, 2));
});

test('M4 explicit WebGL2 renders kit/weather and traverses a district bridge', async ({ page }) => {
  await ready(page, '&backend=webgl');
  const result = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('canal', 'first-person'); h.environment('rain', 'dusk', true);
    h.look(Math.PI, -0.08); h.step(460, { forward: 1 }); return h.snapshot();
  });
  expect(result.facts.backend).toBe('WebGL2');
  expect(result.facts.district!.buildings).toBe(27);
  expect(result.state.player.position.z).toBeGreaterThan(29);
  expect(result.state.player.grounded).toBe(true);
  expect(result.state.resets).toBe(0);
  await page.screenshot({ path: `${directory}/webgl2-rain.png` });
  writeFileSync(`${directory}/webgl2-verification.json`, JSON.stringify(result, null, 2));
});
