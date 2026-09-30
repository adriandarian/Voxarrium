import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// One headed browser and one bounded 60-second actual-W experiment per invocation.
const directory = resolve(process.env.VOXARRIUM_TAIL_DIR ?? 'artifacts/m5/phase-a/clear-01');
const weather = process.env.VOXARRIUM_WEATHER ?? 'clear';
const light = process.env.VOXARRIUM_LIGHT ?? 'day';
const traceEnabled = process.env.VOXARRIUM_TRACE === '1';
if (!['clear', 'cloudy', 'rain'].includes(weather) || !['day', 'dusk', 'night'].includes(light)) throw new Error('Invalid measurement preset');
mkdirSync(directory, { recursive: true });
const write = (name, value) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + '\n');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceStatus = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ channel: process.env.VOXARRIUM_BROWSER ?? 'chrome', headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const route = [[89, -12], [89, -28], [112, -28], [130, -28], [129, -6], [129, 0], [129, 9.9], [129, 29], [96, 29], [96, 9.9], [96, 0], [89, -12]];
let cdp, traceComplete, traceStarted = false;
const traceCategories = [], traceBufferUsage = [];
try {
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  let systemInfo = null;
  try {
    const browserCdp = await browser.newBrowserCDPSession();
    const info = await browserCdp.send('SystemInfo.getInfo');
    systemInfo = { gpu: info.gpu, modelName: info.modelName, modelVersion: info.modelVersion };
    await browserCdp.detach();
  } catch (error) { systemInfo = { unavailable: error.message }; }
  await page.goto('http://127.0.0.1:5173/?scene=m4&test=1&diagnostics=tail');
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 60000 });
  await page.locator('#start').click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
  await page.evaluate(({ weather, light }) => {
    const h = window.__VOXARRIUM__;
    h.bookmark('market'); h.environment(weather, light, true); h.freeze(false);
  }, { weather, light });
  await page.waitForTimeout(3000);
  const startup = await page.evaluate(() => window.__VOXARRIUM__.snapshot());
  if (!startup.tail?.enabled) throw new Error('Tail telemetry is not enabled in the test harness');
  write('startup.json', startup);
  if (traceEnabled) {
    const { categories } = await cdp.send('Tracing.getCategories');
    const wanted = ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc', 'blink.user_timing', 'toplevel', 'cc', 'viz', 'gpu', 'gpu.dawn', 'renderer.scheduler', 'sequence_manager', 'benchmark'];
    // Chromium may report category groups (e.g. "cc,benchmark"), not only individual tokens.
    const available = new Set(categories.flatMap(group => group.split(',')));
    traceCategories.push(...wanted.filter(category => available.has(category)));
    // An empty category filter records browser defaults and can produce a huge intrusive trace.
    if (!traceCategories.includes('devtools.timeline')) traceCategories.push('devtools.timeline');
    if (!traceCategories.includes('blink.user_timing')) traceCategories.push('blink.user_timing');
    traceComplete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    cdp.on('Tracing.bufferUsage', usage => { if (traceBufferUsage.length < 128) traceBufferUsage.push(usage); });
    await cdp.send('Tracing.start', { categories: traceCategories.join(','), options: 'record-as-much-as-possible', transferMode: 'ReturnAsStream', bufferUsageReportingInterval: 5000 });
    traceStarted = true;
  }
  const cdpBefore = await cdp.send('Performance.getMetrics');
  await page.evaluate(() => {
    window.__VOXARRIUM__.resetTail();
    performance.clearMarks('voxarrium:measurement-start');
    performance.mark('voxarrium:measurement-start');
    const anchor = performance.getEntriesByName('voxarrium:measurement-start').at(-1).startTime;
    const m = window.__tailMeasure = {
      frames: [], frameCapacity: 30000, droppedFrames: 0, start: performance.now(), last: null, active: true,
      timerIntervals: [], timerCapacity: 2048, droppedTimers: 0, lastTimer: performance.now(), timerId: null,
      traceAnchor: { name: 'voxarrium:measurement-start', startTime: anchor },
    };
    const sample = now => {
      if (!m.active) return;
      if (m.last !== null) {
        if (m.frames.length < m.frameCapacity) m.frames.push({ time: now, interval: now - m.last });
        else m.droppedFrames++;
      }
      m.last = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    m.timerId = setInterval(() => {
      const now = performance.now();
      if (m.timerIntervals.length < m.timerCapacity) m.timerIntervals.push({ time: now, interval: now - m.lastTimer });
      else m.droppedTimers++;
      m.lastTimer = now;
    }, 50);
  });
  const started = Date.now();
  let waypoint = 1, nextCheckpoint = 0;
  const checkpoints = [];
  await page.keyboard.down('KeyW');
  while (Date.now() - started < 60000) {
    const target = route[Math.min(waypoint, route.length - 1)];
    const result = await page.evaluate(([x, z]) => {
      const h = window.__VOXARRIUM__, p = h.position();
      h.steer(Math.atan2(p.x - x, p.z - z), -.09);
      return { distance: Math.hypot(p.x - x, p.z - z), position: p };
    }, target);
    if (result.distance < .45 && waypoint < route.length - 1) waypoint++;
    if (Date.now() - started >= nextCheckpoint) {
      const snapshot = await page.evaluate(() => window.__VOXARRIUM__.snapshot());
      // Tail export can be large: final has all bounded records; checkpoints need subsystem/resource totals only.
      const { tail, ...state } = snapshot;
      checkpoints.push({ elapsedMs: Date.now() - started, waypoint, ...state, tailSummary: { frameCount: tail.frameCount, maxIntervalMs: tail.maxIntervalMs, maxRafTimestampAgeMs: tail.maxRafTimestampAgeMs, spans: tail.spans, dropped: tail.dropped } });
      nextCheckpoint += 5000;
    }
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  const measurement = await page.evaluate(() => {
    const m = window.__tailMeasure;
    m.active = false; clearInterval(m.timerId);
    const sorted = m.frames.map(frame => frame.interval).filter(n => n > 0).sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
    return {
      durationMs: performance.now() - m.start, samples: sorted.length, meanFrameMs: mean, fps: 1000 / mean,
      medianFrameMs: percentile(.5), p95FrameMs: percentile(.95), p99FrameMs: percentile(.99), maxFrameMs: sorted.at(-1),
      framesOver33ms: sorted.filter(n => n > 33.3).length, longFrames: m.frames.filter(frame => frame.interval > 33.3),
      timeOrigin: performance.timeOrigin, traceAnchor: m.traceAnchor, droppedFrames: m.droppedFrames, droppedTimers: m.droppedTimers,
      timerProbe: { requestedIntervalMs: 50, samples: m.timerIntervals.length, maxIntervalMs: Math.max(...m.timerIntervals.map(row => row.interval)), gaps: m.timerIntervals.filter(row => row.interval > 100) },
      jsHeap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
      visibility: document.visibilityState, focused: document.hasFocus(), final: window.__VOXARRIUM__.snapshot(),
    };
  });
  const cdpAfter = await cdp.send('Performance.getMetrics');
  if (traceStarted) {
    await cdp.send('Tracing.end'); traceStarted = false;
    const { stream } = await traceComplete;
    const chunks = [];
    for (;;) {
      const chunk = await cdp.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
      if (chunk.eof) break;
    }
    await cdp.send('IO.close', { handle: stream });
    writeFileSync(resolve(directory, 'browser-performance-trace.json'), Buffer.concat(chunks));
  }
  await page.screenshot({ path: resolve(directory, 'route-end.png') });
  const report = {
    measuredAt: new Date().toISOString(), revision, sourceStatus, browserVersion: browser.version(), headed: true,
    viewport: { width: 1920, height: 1080, dpr: 1 }, scene: 'm4', traceEnabled, traceCategories, traceBufferUsage,
    scope: 'One controlled actual-W River Market route after 3s warmup, 60s wall time. Query diagnostics=tail adds bounded CPU telemetry. CDP tracing adds overhead. Lightweight position/steer harness APIs read position/set yaw every100ms without extra draws; resource checkpoints every5s. Timer/rAF delays include browser scheduling and automation. No GPU timestamp queries or OS scheduler tracing.',
    environmentPreset: { weather, light }, route, reachedWaypoint: waypoint,
    ...measurement, checkpoints, cdpMetrics: { before: cdpBefore.metrics, after: cdpAfter.metrics }, systemInfo, errors,
  };
  write('performance-route-60s.json', report);
  console.log(JSON.stringify({ directory, samples: report.samples, p50: report.medianFrameMs, p95: report.p95FrameMs, p99: report.p99FrameMs, max: report.maxFrameMs, longFrames: report.framesOver33ms, timerMax: report.timerProbe.maxIntervalMs, reachedWaypoint: waypoint, dropped: report.final.tail.dropped, errors }));
  if (errors.length || report.final.state.resets || report.final.state.paused || report.final.state.population.length !== 42 || report.droppedFrames || report.droppedTimers) throw new Error('Measurement errors/reset/pause/population loss/dropped sample; inspect report');
} finally {
  if (traceStarted) await cdp.send('Tracing.end').catch(() => {});
  await page.evaluate(() => { if (window.__tailMeasure) { window.__tailMeasure.active = false; clearInterval(window.__tailMeasure.timerId); } }).catch(() => {});
  await context.close(); await browser.close();
}
