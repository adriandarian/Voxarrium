import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Fixed one-minute local benchmark, explicitly invoked; no background monitor.
const directory = process.env.VOXARRIUM_CAPTURE_DIR ?? 'artifacts/m2/final';
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.VOXARRIUM_BROWSER ?? 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://127.0.0.1:5173/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.locator('#start').click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
  await page.evaluate(() => {
    const h = window.__VOXARRIUM__;
    h.bookmark('bridge'); h.teleport({ x: -2, y: 0.03, z: 29 });
    h.step(30); h.freeze(false);
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.__ruralMeasure = { frames: [], start: performance.now(), last: performance.now(), active: true };
    const sample = now => {
      const m = window.__ruralMeasure;
      if (!m.active) return;
      m.frames.push(now - m.last); m.last = now; requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const forward = [[-2,10.5],[-7,10.5],[-7,1.4],[0,1],[4.95,1],[4.95,-14],[-7,-14],[-14,-12.8],[-14,-22.5],[-4,-24]];
  const route = [...forward, ...forward.slice(0, -1).reverse(), [-2,29]];
  let waypoint = 0;
  const samples = [];
  await page.keyboard.down('KeyW');
  const started = Date.now();
  let nextSample = 0;
  while (Date.now() - started < 60_000) {
    const target = route[Math.min(waypoint, route.length - 1)];
    const result = await page.evaluate(([x,z]) => {
      const h = window.__VOXARRIUM__, snap = h.snapshot(), p = snap.state.player.position;
      h.look(Math.atan2(p.x - x, p.z - z), -0.13);
      return { distance: Math.hypot(p.x-x,p.z-z), snapshot: snap };
    }, target);
    if (result.distance < 0.48 && waypoint < route.length - 1) waypoint++;
    if (Date.now() - started >= nextSample) {
      samples.push({ elapsedMs: Date.now() - started, waypoint, ...result.snapshot });
      nextSample += 5000;
    }
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  const measurement = await page.evaluate(() => {
    const m = window.__ruralMeasure; m.active = false;
    const sorted = m.frames.filter(n => n > 0).sort((a,b) => a-b);
    const mean = sorted.reduce((a,b) => a+b,0) / sorted.length;
    const percentile = p => sorted[Math.ceil(sorted.length*p)-1];
    return { durationMs: performance.now()-m.start, samples: sorted.length,
      meanFrameMs: mean, fps: 1000/mean, medianFrameMs: percentile(.5), p95FrameMs: percentile(.95),
      p99FrameMs: percentile(.99), maxFrameMs: sorted.at(-1), framesOver33ms: sorted.filter(n=>n>33.3).length,
      jsHeap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
      final: window.__VOXARRIUM__.snapshot() };
  });
  await page.screenshot({ path: `${directory}/performance-route-end.png` });
  const report = { measuredAt: new Date().toISOString(), browserVersion: browser.version(), headed: true,
    scope: '60-second real-time third-person route driven by actual W input and deterministic waypoint steering; rAF wall-clock intervals including automation, not GPU execution. JS heap is not VRAM.',
    route, reachedWaypoint: waypoint, ...measurement, checkpoints: samples, errors };
  writeFileSync(`${directory}/performance-route-60s.json`, JSON.stringify(report,null,2));
  console.log(JSON.stringify({ durationMs: report.durationMs, fps: report.fps, p95FrameMs: report.p95FrameMs, reachedWaypoint: waypoint, errors }));
  if (errors.length || report.final.state.resets !== 1 || report.final.state.paused) throw new Error('Benchmark encountered an error, recovery or pause; inspect report.');
} finally { await context.close(); await browser.close(); }
