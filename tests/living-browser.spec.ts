import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const directory = process.env.VOXARRIUM_CAPTURE_DIR ?? 'artifacts/m3/final';
mkdirSync(directory, { recursive: true });
async function ready(page: import('@playwright/test').Page, backend = '') {
  await page.goto(`/?test=1${backend}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
}

test('M3 environment transitions, pause and reduced motion share the fixed clock', async ({ page }) => {
  await ready(page);
  const values = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('spawn');
    const initial = h.snapshot(); h.environment('rain', 'dusk');
    const start = h.snapshot(); h.step(120); const middle = h.snapshot();
    h.pause(true); h.step(120); const paused = h.snapshot();
    h.pause(false); h.step(240); const final = h.snapshot();
    return { initial, start, middle, paused, final };
  });
  expect(values.initial.state.environment!.lighting.sunIntensity).toBe(2.75);
  expect(values.start.state.environment!.rain).toBe(0);
  expect(values.middle.state.environment!.rain).toBeGreaterThan(0);
  expect(values.middle.state.environment!.rain).toBeLessThan(1);
  expect(values.paused.state.environment).toEqual(values.middle.state.environment);
  expect(values.paused.state.population).toEqual(values.middle.state.population);
  expect(values.final.state.environment!.rain).toBe(1);
  expect(values.final.state.environment!.time).toBeGreaterThan(values.middle.state.environment!.time);
  await page.evaluate(() => window.__VOXARRIUM__!.pause(true));
  await page.locator('#living-settings').evaluate(el => (el as HTMLDetailsElement).open = true);
  await page.locator('#quality-select').selectOption('reduced');
  expect(await page.evaluate(() => window.__VOXARRIUM__!.snapshot().settings.reducedMotion)).toBe(true);
  await page.locator('#weather-select').selectOption('cloudy');
  await page.locator('#time-select').selectOption('night');
  const selected = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  expect(selected.state.environment!.weather).toBe('cloudy');
  expect(selected.state.environment!.timeOfDay).toBe('night');
});

test('M3 actual F interaction in both gameplay views and rain shelter routines', async ({ page }) => {
  await ready(page);
  for (const mode of ['third-person', 'first-person'] as const) {
    await page.evaluate(mode => {
      const h = window.__VOXARRIUM__!; h.bookmark('spawn', mode);
      const npc = h.snapshot().state.population[0]!;
      h.teleport({ ...npc.position, z: npc.position.z + 1.3 }); h.look(0, 0.04); h.step(10);
      document.getElementById('world')!.focus();
    }, mode);
    await page.keyboard.press('KeyF');
    await expect(page.locator('#dialogue')).toBeVisible();
    await expect(page.locator('#dialogue-text')).not.toBeEmpty();
    expect((await page.evaluate(() => window.__VOXARRIUM__!.snapshot())).state.interaction?.id).toContain('local.');
    await page.keyboard.press('KeyF'); await expect(page.locator('#dialogue')).toBeHidden();
  }
  const rain = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.environment('rain', 'day', true); h.resetPopulation(); h.step(3600); return h.snapshot();
  });
  expect(rain.state.population.every(n => n.mode === 'sheltered')).toBe(true);
  const clear = await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.environment('clear', 'day', true); h.step(600); return h.snapshot(); });
  expect(clear.state.population.some(n => n.mode === 'walking')).toBe(true);
  writeFileSync(`${directory}/shelter-routines.json`, JSON.stringify({ rain, clear }, null, 2));
});

test('M3 rain preserves running, jumping, V camera switching and Esc resume', async ({ page }) => {
  await ready(page);
  const run = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('bridge'); h.teleport({ x: -2, y: 0.04, z: 29 }); h.look(Math.PI, -0.1);
    h.environment('rain', 'day', true); h.step(30); const before = h.snapshot(); h.step(80, { forward: 1, run: true }); const after = h.snapshot();
    h.step(12, { jump: true }); const jump = h.snapshot(); h.step(100); return { before, after, jump, landed: h.snapshot() };
  });
  expect(run.after.state.player.position.z - run.before.state.player.position.z).toBeGreaterThan(5);
  expect(run.jump.state.player.position.y).toBeGreaterThan(run.after.state.player.position.y + 0.3);
  expect(run.landed.state.player.grounded).toBe(true); expect(run.landed.state.resets).toBe(1);
  await page.locator('#world').focus(); await page.keyboard.press('KeyV');
  expect(await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.camera.mode)).toBe('first-person');
  await page.keyboard.press('Escape'); await expect(page.locator('#menu')).toBeVisible();
  const paused = await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.environment!.time);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.environment!.time)).toBe(paused);
  await page.locator('#start').click(); await expect(page.locator('#menu')).toBeHidden();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__VOXARRIUM__!.snapshot().state.environment!.time)).toBeGreaterThan(paused);
});

test('M3 audio waits for gesture, emits signal, follows position and obeys volume/pause', async ({ page }) => {
  await ready(page);
  expect(await page.evaluate(() => window.__VOXARRIUM__!.snapshot().audio.status)).toBe('awaiting-gesture');
  await page.locator('#start').click();
  await page.waitForTimeout(500);
  const started = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  expect(started.audio.status).toBe('running'); expect(started.audio.outputRms).toBeGreaterThan(0.00005);
  await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.freeze(); h.environment('rain', 'day', true); h.bookmark('bridge'); h.look(Math.PI, -0.1); h.step(100, { forward: 1 }); });
  await page.waitForTimeout(400);
  const rain = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  expect(rain.audio.stepCount).toBeGreaterThan(0); expect(rain.audio.lastSurface).toBe('wood');
  expect(rain.audio.levels.rain).toBeGreaterThan(0); expect(rain.audio.listener.z).toBeCloseTo(rain.state.player.position.z, 2);
  expect(rain.audio.activeLoops + rain.audio.activeVoices).toBeLessThanOrEqual(rain.audio.maxVoices);
  const recording = await page.evaluate(() => window.__VOXARRIUM__!.recordAudio(3));
  writeFileSync(`${directory}/rain-river-audio.webm`, Buffer.from(recording));
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  const paused = await page.evaluate(() => window.__VOXARRIUM__!.snapshot().audio);
  expect(paused.outputRms).toBeLessThan(0.00001); expect(paused.activeVoices).toBe(0);
  await page.locator('#living-settings').evaluate(el => (el as HTMLDetailsElement).open = true);
  await page.locator('#volume-master').fill('0'); await page.locator('#volume-ambience').fill('0.2');
  await page.locator('#start').click(); await page.waitForTimeout(350);
  const muted = await page.evaluate(() => window.__VOXARRIUM__!.snapshot().audio);
  expect(muted.settings.master).toBe(0); expect(muted.settings.ambience).toBe(0.2); expect(muted.outputRms).toBeLessThan(0.00001);
  writeFileSync(`${directory}/audio-verification.json`, JSON.stringify({ started, rain, paused, muted,
    scope: 'Actual browser Web Audio graph output signal and internal recording after a click; no microphone capture or physical speaker listening claim.' }, null, 2));
});

test('evidence: M3 day dusk night rain, NPC interaction and initialized performance', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page);
  const states: Record<string, unknown> = {};
  for (const [name, bookmark, mode, weather, light] of [
    ['eagle-eye-day', 'spawn', 'eagle-eye', 'clear', 'day'],
    ['third-person-day', 'spawn', 'third-person', 'clear', 'day'],
    ['first-person-day', 'cottageFront', 'first-person', 'clear', 'day'],
    ['third-person-cloudy', 'spawn', 'third-person', 'cloudy', 'day'],
    ['eagle-eye-dusk', 'spawn', 'eagle-eye', 'clear', 'dusk'],
    ['third-person-dusk', 'spawn', 'third-person', 'clear', 'dusk'],
    ['first-person-night', 'cottageFront', 'first-person', 'clear', 'night'],
    ['third-person-night', 'spawn', 'third-person', 'clear', 'night'],
    ['eagle-eye-rain', 'spawn', 'eagle-eye', 'rain', 'day'],
    ['third-person-rain', 'spawn', 'third-person', 'rain', 'day'],
    ['first-person-rain', 'bridge', 'first-person', 'rain', 'day'],
  ] as const) {
    await page.setViewportSize(name.startsWith('eagle') ? { width: 900, height: 1200 } : { width: 1440, height: 900 });
    await page.evaluate(({ bookmark, mode, weather, light }) => {
      const h = window.__VOXARRIUM__!; h.bookmark(bookmark, mode); h.environment(weather, light, true);
      if (weather === 'rain' || light === 'night') h.step(3600);
    }, { bookmark, mode, weather, light });
    const clean = await page.addStyleTag({ content: '.identity,.backend-badge,.hud-bottom,#diagnostics,#crosshair,#interact-prompt {visibility:hidden}' });
    await page.screenshot({ path: `${directory}/${name}.png` });
    await clean.evaluate(node => node.parentNode?.removeChild(node));
    states[name] = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('spawn', 'first-person'); h.environment('clear', 'day', true);
    const npc = h.snapshot().state.population[0]!; h.teleport({ ...npc.position, z: npc.position.z + 1.7 }); h.look(0, 0.02); h.step(5); h.interact(); h.step(75);
  });
  await page.screenshot({ path: `${directory}/npc-interaction.png` });
  states.interaction = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  // Motion is captured at identical poses with only simulation time advanced.
  const clean = await page.addStyleTag({ content: '.identity,.backend-badge,.hud-bottom,#diagnostics,#crosshair,#interact-prompt,#dialogue {visibility:hidden}' });
  await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.bookmark('garden', 'first-person'); h.environment('cloudy', 'day', true); });
  for (const [name, steps] of [['motion-time-0', 0], ['motion-time-3', 180]] as const) {
    await page.evaluate(steps => window.__VOXARRIUM__!.step(steps), steps);
    await page.screenshot({ path: `${directory}/${name}.png` }); states[name] = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  }
  await clean.evaluate(node => node.parentNode?.removeChild(node));
  await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.bookmark('spawn'); h.environment('clear', 'day', true); h.freeze(false); h.resetTimings(); });
  await page.waitForFunction(() => window.__VOXARRIUM__!.snapshot().timing.sampleCount >= 500, undefined, { timeout: 45_000 });
  const report = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  expect(report.facts.backend).toBe('WebGPU'); expect(errors).toEqual([]);
  writeFileSync(`${directory}/capture-states.json`, JSON.stringify(states, null, 2));
  writeFileSync(`${directory}/performance-headed.json`, JSON.stringify({ measuredAt: new Date().toISOString(), browserVersion: browser.version(),
    headed: process.env.VOXARRIUM_HEADED === '1', scope: 'Warmed M3 idle third-person spawn; rAF wall-clock intervals, not GPU execution time.', ...report, errors }, null, 2));
});

test('M3 explicit WebGL2 supports rain, wind, NPCs and first-person crossing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page, '&backend=webgl');
  const result = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.bookmark('bridge', 'first-person'); h.environment('rain', 'dusk', true); h.step(460, { forward: 1 }); return h.snapshot();
  });
  expect(result.facts.backend).toBe('WebGL2'); expect(result.state.player.position.z).toBeGreaterThan(28);
  expect(result.state.player.grounded).toBe(true); expect(result.state.population).toHaveLength(6); expect(errors).toEqual([]);
  await page.screenshot({ path: `${directory}/webgl-rain.png` });
  writeFileSync(`${directory}/webgl-rain.json`, JSON.stringify({ ...result, errors }, null, 2));
});

test('M3 recovery preserves world identities and disposal closes sound and render ownership', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page); await page.locator('#start').click();
  await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.freeze(); h.environment('rain', 'night', true); h.step(180); });
  const before = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  await page.keyboard.press('KeyR');
  const recovered = await page.evaluate(() => window.__VOXARRIUM__!.snapshot());
  expect(recovered.state.resets).toBe(before.state.resets + 1);
  expect(recovered.state.environment).toEqual(before.state.environment);
  expect(recovered.state.population.map(n => n.id)).toEqual(before.state.population.map(n => n.id));
  const disposed = await page.evaluate(() => {
    const h = window.__VOXARRIUM__!; h.dispose(); h.dispose();
    return { audio: h.snapshot().audio, removed: window.__VOXARRIUM__ === undefined };
  });
  await page.waitForTimeout(350);
  expect(disposed.removed).toBe(true); expect(disposed.audio.status).toBe('disposed');
  expect(disposed.audio.activeLoops).toBe(0); expect(disposed.audio.activeVoices).toBe(0); expect(errors).toEqual([]);
  writeFileSync(`${directory}/lifecycle-verification.json`, JSON.stringify({ before, recovered, disposed, errors }, null, 2));
});
