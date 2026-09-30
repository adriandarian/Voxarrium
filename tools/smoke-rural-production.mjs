import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const directory = process.env.VOXARRIUM_CAPTURE_DIR ?? 'artifacts/m2/final';
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.VOXARRIUM_BROWSER ?? 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://127.0.0.1:4173/?scene=m2&test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 60_000 });
  const harnessAbsent = await page.evaluate(() => window.__VOXARRIUM__ === undefined);
  assert(harnessAbsent, 'Production must not expose the development harness');
  await page.locator('#start').click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
  await page.waitForTimeout(400);
  const before = await page.locator('#diagnostics').innerText();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const after = await page.locator('#diagnostics').innerText();
  const position = text => text.match(/XYZ\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/).slice(1).map(Number);
  const start = position(before), end = position(after);
  const traveledMeters = Math.hypot(end[0] - start[0], end[2] - start[2]);
  assert(traveledMeters > 0.5, 'Actual keyboard input should move the player');
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => document.querySelector('#camera-mode')?.textContent === 'FIRST PERSON');
  await page.waitForTimeout(400);
  const finalDiagnostics = await page.locator('#diagnostics').innerText();
  assert(finalDiagnostics.includes('m2-rural-96m') && finalDiagnostics.includes('first-person'));
  await page.waitForFunction(() => !document.getElementById('interact-prompt').hidden, undefined, { timeout: 5000 });
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !document.getElementById('dialogue').hidden);
  const dialogue = await page.locator('#dialogue').innerText();
  assert(dialogue.includes('·') && dialogue.length > 40, 'Actual F should open authored nearby dialogue in production');
  await page.screenshot({ path: `${directory}/production-interaction.png` });
  await page.keyboard.press('KeyF');
  await page.keyboard.press('Escape');
  await page.locator('#living-settings').evaluate(node => { node.open = true; });
  await page.locator('#weather-select').selectOption('rain');
  await page.locator('#time-select').selectOption('dusk');
  await page.locator('#start').click();
  await page.waitForTimeout(4500);
  const rainDiagnostics = await page.locator('#diagnostics').innerText();
  assert(rainDiagnostics.includes('dusk · rain'));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${directory}/production-smoke.png` });
  const report = { measuredAt: new Date().toISOString(), browser: browser.version(), headed: true,
    viewport: { width: 1440, height: 900 }, dpr: 1, harnessAbsent, pointerLocked: true,
    before, after, traveledMeters, finalDiagnostics, dialogue, rainDiagnostics, errors };
  writeFileSync(`${directory}/production-smoke.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
