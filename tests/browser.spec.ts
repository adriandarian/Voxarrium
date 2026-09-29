import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { CameraMode, InputFrame } from '../src/simulation/types';

const evidenceDir = 'artifacts/m1';
mkdirSync(evidenceDir, { recursive: true });
let messages: { type: string; text: string }[];
let intentionalStartupFailure = false;

test.beforeEach(async ({ page }) => {
  messages = [];
  intentionalStartupFailure = false;
  page.on('pageerror', error => messages.push({ type: 'pageerror', text: error.message }));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') messages.push({ type: message.type(), text: message.text() });
  });
});
test.afterEach(async ({}, info) => {
  await info.attach('browser-console', { body: JSON.stringify(messages, null, 2), contentType: 'application/json' });
  expect(messages.filter(message => message.type === 'pageerror' ||
    (message.type === 'error' && !(intentionalStartupFailure && message.text.startsWith('Voxarrium startup/runtime failure')))), 'No unexpected console/page errors').toEqual([]);
});

async function open(page: Page, suffix = '') {
  await page.goto(`/?scene=m1&test=1${suffix}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 40_000 });
  await page.waitForFunction(() => !!window.__VOXARRIUM__);
}
const snapshot = (page: Page) => page.evaluate(() => window.__VOXARRIUM__!.snapshot());
const bookmark = (page: Page, name: string, mode: CameraMode = 'third-person') =>
  page.evaluate(({ name, mode }) => window.__VOXARRIUM__!.bookmark(name, mode), { name, mode });
const step = (page: Page, frames: number, input: Partial<InputFrame> = {}) =>
  page.evaluate(({ frames, input }) => window.__VOXARRIUM__!.step(frames, input), { frames, input });

test('initialized backend, fixture dimensions/axes/materials and deterministic state', async ({ page }) => {
  await open(page);
  const initial = await snapshot(page);
  expect(['WebGPU', 'WebGL2']).toContain(initial.facts.backend);
  expect(initial.facts.assetReady && initial.facts.shadersReady).toBe(true);
  expect(initial.facts.fixture.dimensions).toEqual([1, 1, 1]);
  expect(initial.facts.fixture.axes.every(axis => axis.passed)).toBe(true);
  expect(initial.facts.fixture.materials).toHaveLength(4);
  expect(initial.facts.errors).toEqual([]);
  if (initial.facts.backend === 'WebGL2') {
    expect(initial.facts.fallbackOccurred).toBe(true);
    expect(initial.facts.fallbackReason).toBeTruthy();
  }
  await bookmark(page, 'doorway');
  const first = await step(page, 120, { forward: 1 });
  await bookmark(page, 'doorway');
  const second = await step(page, 120, { forward: 1 });
  expect(second.player.position.x).toBeCloseTo(first.player.position.x, 4);
  expect(second.player.position.y).toBeCloseTo(first.player.position.y, 4);
  expect(second.player.position.z).toBeCloseTo(first.player.position.z, 4);
});

for (const mode of ['third-person', 'first-person'] as const) {
  test(`${mode}: slope, stairs, door, alley, bridge, wall, clearance and falling`, async ({ page }) => {
    await open(page);
    const records: Record<string, unknown> = {};
    for (const [name, frames] of [['slope', 290], ['stairs', 170], ['doorway', 150], ['alley', 315], ['bridge', 260], ['wall', 180], ['lowCeiling', 150], ['headroom', 150], ['steepSlope', 210]] as const) {
      await bookmark(page, name, mode);
      const result = await step(page, frames, { forward: 1 });
      records[name] = result.player;
      const { x, y, z } = result.player.position;
      expect(result.resets, `${name} must not need recovery`).toBe(0);
      expect(result.player.grounded, `${name} ends grounded`).toBe(true);
      if (name === 'slope') { expect(y).toBeGreaterThan(1.8); expect(z).toBeLessThan(-11); }
      if (name === 'stairs') { expect(y).toBeCloseTo(1.375, 1); expect(z).toBeLessThan(-6); }
      if (name === 'doorway') { expect(z).toBeLessThan(5); expect(x).toBeCloseTo(-12, 1); }
      if (name === 'alley') { expect(z).toBeLessThan(1); expect(x).toBeCloseTo(14, 1); }
      if (name === 'bridge') { expect(z).toBeLessThan(-27); expect(y).toBeLessThan(0.3); }
      if (name === 'wall') { expect(z).toBeGreaterThan(-3.45); expect(z).toBeLessThan(-3.1); }
      if (name === 'lowCeiling') { expect(z).toBeGreaterThan(9.0); expect(y).toBeLessThan(0.08); }
      if (name === 'headroom') { expect(z).toBeLessThan(1); expect(y).toBeLessThan(0.08); }
      if (name === 'steepSlope') { expect(y).toBeLessThan(0.3); expect(z).toBeGreaterThan(-3.3); }
    }
    await bookmark(page, 'drop', mode);
    await step(page, 80, { forward: 1 });
    const falling = await snapshot(page);
    expect(falling.state.player.position.y).toBeLessThan(-0.3);
    const recovered = await step(page, 160);
    expect(recovered.resets).toBeGreaterThan(0);
    expect(recovered.player.position.z).toBeCloseTo(16, 1);
    expect(recovered.player.grounded).toBe(true);
    records.recovery = recovered;
    writeFileSync(`${evidenceDir}/traversal-${mode}.json`, JSON.stringify(records, null, 2));
  });
}

test('jump, run, headroom and camera obstruction preserve the physical player', async ({ page }) => {
  await open(page);
  await bookmark(page, 'spawn');
  const walked = await step(page, 60, { forward: 1 });
  await bookmark(page, 'spawn');
  const ran = await step(page, 60, { forward: 1, run: true });
  expect(16 - ran.player.position.z).toBeGreaterThan((16 - walked.player.position.z) * 1.6);
  await bookmark(page, 'spawn');
  const jumped = await step(page, 15, { jump: true });
  expect(jumped.player.position.y).toBeGreaterThan(0.5);
  expect(jumped.player.grounded).toBe(false);
  const landed = await step(page, 70);
  expect(landed.player.grounded).toBe(true);
  await bookmark(page, 'headroom');
  await step(page, 60, { forward: 1 });
  const underCeiling = await step(page, 15, { jump: true });
  expect(underCeiling.player.position.y + 1.75).toBeLessThan(2.06);

  await bookmark(page, 'obstruction');
  const blocked = await snapshot(page);
  const p = blocked.state.player.position;
  expect(blocked.camera.position[2]).toBeGreaterThan(-3.5);
  expect(blocked.render.avatarVisible).toBe(false);
  expect(Math.hypot(blocked.camera.position[0] - p.x, blocked.camera.position[1] - p.y - 1.43, blocked.camera.position[2] - p.z)).toBeLessThan(1);
  await page.keyboard.press('KeyV');
  const firstPerson = await snapshot(page);
  expect(firstPerson.state.player).toEqual(blocked.state.player);
  expect(firstPerson.state.camera.mode).toBe('first-person');
  expect(firstPerson.camera.position[1] - p.y).toBeCloseTo(1.62, 4);
  await page.keyboard.press('KeyV');
  const thirdPerson = await snapshot(page);
  expect(thirdPerson.state.player).toEqual(blocked.state.player);
  expect(thirdPerson.state.camera.mode).toBe('third-person');
  await step(page, 120, { forward: 1 });
  const cleared = await snapshot(page);
  expect(Math.abs(cleared.camera.position[2] - cleared.state.player.position.z)).toBeGreaterThan(3.8);
});

test('pointer lock, keyboard movement/look, pause/blur, settings, free camera and resize', async ({ page }) => {
  await open(page);
  await page.locator('#start').click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snapshot(page)).state.player.position.z).toBeLessThan(15);
  await page.keyboard.up('KeyW');
  const yawBefore = (await snapshot(page)).state.camera.yaw;
  await page.mouse.move(950, 440);
  await page.mouse.move(1070, 460, { steps: 5 });
  await expect.poll(async () => (await snapshot(page)).state.camera.yaw).not.toBe(yawBefore);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  expect((await snapshot(page)).pointerLocked).toBe(false);
  const paused = (await snapshot(page)).state.player.position;
  await page.keyboard.down('KeyW');
  await page.evaluate(() => new Promise<void>(resolve => { let n = 0; function next() { if (++n >= 20) resolve(); else requestAnimationFrame(next); } requestAnimationFrame(next); }));
  await page.keyboard.up('KeyW');
  expect((await snapshot(page)).state.player.position).toEqual(paused);
  await page.locator('#fov').fill('80');
  await expect.poll(async () => (await snapshot(page)).camera.fov).toBe(80);
  await page.locator('#camera-select').selectOption('first-person');
  expect((await snapshot(page)).state.player.position).toEqual(paused);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(async () => (await snapshot(page)).render.drawingBuffer.width).toBe(900);
  expect((await snapshot(page)).camera.aspect).toBeCloseTo(900 / 700, 4);
  // Browser's pointer-lock re-entry safety interval is controlled by Chrome.
  await page.waitForTimeout(1400);
  await page.locator('#start').click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('KeyW');
  expect((await snapshot(page)).state.paused).toBe(true);
  await expect(page.locator('#menu')).toBeVisible();
  await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.freeze(); h.pause(false); h.mode('free'); });
  const beforeFree = await snapshot(page);
  await step(page, 60, { forward: 1, ascend: 1 });
  const afterFree = await snapshot(page);
  expect(afterFree.camera.position[1]).toBeGreaterThan(beforeFree.camera.position[1] + 2);
  expect(afterFree.state.player.position.x).toBeCloseTo(beforeFree.state.player.position.x, 1);
});

for (const failure of ['rejected', 'missing', 'resolved-without-lock'] as const) {
  test(`mouse capture ${failure}: drag look, movement and pause remain usable`, async ({ page }) => {
    await page.addInitScript(failure => {
      if (failure === 'missing') {
        Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { value: undefined, configurable: true });
      } else {
        HTMLCanvasElement.prototype.requestPointerLock = () => failure === 'rejected'
          ? Promise.reject(new DOMException('If you see this error we have a bug. Please report this bug to chromium.', 'UnknownError'))
          : Promise.resolve();
      }
    }, failure);
    // Exercise the reported rural entry flow, not only the M1 course.
    await page.goto('/?test=1');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.locator('#start').click();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#look-hint')).toHaveText('Hold left mouse + drag to look');
    expect((await snapshot(page)).pointerLocked).toBe(false);
    const before = (await snapshot(page)).state.player.position;
    await page.keyboard.down('KeyW');
    await expect.poll(async () => before.z - (await snapshot(page)).state.player.position.z).toBeGreaterThan(0.5);
    await page.keyboard.up('KeyW');
    for (const mode of ['third-person', 'first-person'] as const) {
      if (mode === 'first-person') await page.keyboard.press('KeyV');
      expect((await snapshot(page)).state.camera.mode).toBe(mode);
      const yaw = (await snapshot(page)).state.camera.yaw;
      await page.mouse.move(700, 400);
      expect((await snapshot(page)).state.camera.yaw).toBe(yaw);
      await page.mouse.down();
      await page.mouse.move(820, 430, { steps: 6 });
      await expect.poll(async () => (await snapshot(page)).state.camera.yaw).toBeLessThan(yaw - 0.2);
      await page.mouse.up();
      const releasedYaw = (await snapshot(page)).state.camera.yaw;
      await page.mouse.move(900, 460);
      expect((await snapshot(page)).state.camera.yaw).toBe(releasedYaw);
    }
    await page.mouse.down();
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Escape');
    await page.keyboard.up('KeyW');
    await page.mouse.up();
    await expect(page.locator('#menu')).toBeVisible();
    expect((await snapshot(page)).state.paused).toBe(true);
    await expect(page.locator('#notice')).not.toContainText('chromium');
    const pausedYaw = (await snapshot(page)).state.camera.yaw;
    await page.locator('#start').click();
    await expect(page.locator('#menu')).toBeHidden();
    await page.mouse.move(500, 400);
    expect((await snapshot(page)).state.camera.yaw).toBe(pausedYaw);
    // Blur still clears movement and drag even without native pointer lock.
    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('KeyW');
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#start').click();
    await expect.poll(async () => Math.abs((await snapshot(page)).state.player.velocity.z)).toBeLessThan(0.01);
  });
}

test('a delayed capture rejection cannot resume after focus was lost', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => new Promise((_, reject) => {
      window.addEventListener('blur', () => reject(new DOMException('Capture unavailable', 'UnknownError')), { once: true });
    });
  });
  await open(page);
  await page.locator('#start').click();
  await expect(page.locator('#start')).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#start')).toBeEnabled();
  expect((await snapshot(page)).state.paused).toBe(true);
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#start').click();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#look-hint')).toContainText('drag');
});

test('explicit WebGL2 fallback initializes the same scene', async ({ page }) => {
  await open(page, '&backend=webgl');
  const result = await snapshot(page);
  expect(result.facts.backend).toBe('WebGL2');
  expect(result.facts.requestedBackend).toContain('explicit');
  expect(result.facts.fallbackOccurred).toBe(false);
  await bookmark(page, 'stairs');
  const climbed = await step(page, 170, { forward: 1 });
  expect(climbed.player.position.y).toBeGreaterThan(1.3);
  await page.screenshot({ path: `${evidenceDir}/webgl-fallback.png` });
  writeFileSync(`${evidenceDir}/webgl-fallback.json`, JSON.stringify({ ...await snapshot(page), console: messages }, null, 2));
});

test('unavailable WebGPU uses explicit reported automatic fallback', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  await open(page);
  const result = await snapshot(page);
  expect(result.facts.backend).toBe('WebGL2');
  expect(result.facts.fallbackOccurred).toBe(true);
  expect(result.facts.fallbackReason).toMatch(/WebGPU|GPU/i);
  await expect(page.locator('#backend-badge')).toContainText('WebGL2');
  writeFileSync(`${evidenceDir}/automatic-fallback.json`, JSON.stringify({ ...result, console: messages }, null, 2));
});

test('DPR cap keeps high-density rendering bounded', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  const result = await snapshot(page);
  expect(result.render.dpr).toBe(2);
  expect(result.render.drawingBuffer).toEqual({ width: 1600, height: 1200 });
  expect(errors).toEqual([]);
  await context.close();
});

test('failed initialization is visible and does not leave an unhandled rejection', async ({ page }) => {
  intentionalStartupFailure = true;
  // Exercise the application's error path without GPU flags or browser-policy changes.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (args[0] === 'webgl2') return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/?test=1');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'failed');
  await expect(page.locator('#fatal')).toContainText('Renderer startup failed');
  await expect(page.locator('#fatal')).toBeVisible();
  expect(await page.evaluate(() => window.__VOXARRIUM__)).toBeUndefined();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
});

test('evidence: reference/gameplay cameras, traversal frames and local performance baseline', async ({ page, browser }) => {
  await open(page);
  const captures = [
    ['eagle-eye', 'spawn', 'eagle-eye', 0],
    ['third-person', 'spawn', 'third-person', 0],
    ['first-person', 'doorway', 'first-person', 0],
    ['stairs-traversal', 'stairs', 'third-person', 100],
    ['terrace', 'stairs', 'third-person', 170],
    ['bridge-traversal', 'bridge', 'first-person', 125],
    ['alley-traversal', 'alley', 'third-person', 145],
    ['camera-obstruction', 'obstruction', 'third-person', 0],
  ] as const;
  const states: Record<string, unknown> = {};
  for (const [name, point, mode, frames] of captures) {
    await bookmark(page, point, mode);
    if (frames) await step(page, frames, { forward: 1 });
    await page.screenshot({ path: `${evidenceDir}/${name}.png` });
    states[name] = await snapshot(page);
  }
  await bookmark(page, 'spawn', 'first-person');
  await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.teleport({ x: -1, y: 0.02, z: 13 }); h.look(Math.PI / 4, -0.21); });
  await page.screenshot({ path: `${evidenceDir}/blender-calibration.png` });
  states['blender-calibration'] = await snapshot(page);

  await bookmark(page, 'spawn', 'third-person');
  await page.evaluate(() => { const h = window.__VOXARRIUM__!; h.freeze(false); h.resetTimings(); });
  await page.waitForFunction(() => window.__VOXARRIUM__!.snapshot().timing.sampleCount >= 500, { timeout: 30_000 });
  const baseline = await snapshot(page);
  const performanceReport = {
    measuredAt: new Date().toISOString(), browserVersion: browser.version(),
    headed: process.env.VOXARRIUM_HEADED === '1',
    scope: 'Local M1 idle third-person at spawn; rAF wall-clock timing, not GPU timing. Browser automation and dev server active.',
    ...baseline, console: messages,
  };
  writeFileSync(`${evidenceDir}/performance.json`, JSON.stringify(performanceReport, null, 2));
  writeFileSync(`${evidenceDir}/performance-${process.env.VOXARRIUM_HEADED === '1' ? 'headed' : 'headless'}.json`, JSON.stringify(performanceReport, null, 2));
  writeFileSync(`${evidenceDir}/capture-states.json`, JSON.stringify(states, null, 2));
});
