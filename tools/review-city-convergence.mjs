import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Assemble only completed local evidence; this tool never creates game captures.
const root = 'artifacts/m6.1';
const read = name => JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
const states = read('browser/capture-states.json');
const route = read('browser/traversal.json');
const fallback = read('browser/webgl2-traversal.json');
const browser = read('browser-suite.json');
const simulation = read('simulation-suite.json');
const metadata = read('metadata-check.json');
const refresh = read('city-refresh-suite.json');
const production = read('production/production-smoke.json');
const old = JSON.parse(readFileSync('artifacts/m6/browser/capture-states.json', 'utf8'))['master-eagle-eye'];
const overview = states['master-eagle-eye'];
const specs = suite => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)];
for (const [name, report, count] of [['browser', browser, 37], ['simulation', simulation, 118], ['metadata', metadata, 1], ['city refresh', refresh, 2]]) {
  assert.equal(report.stats.expected, count, `${name} complete passing case count`);
  for (const key of ['unexpected', 'flaky', 'skipped']) assert.equal(report.stats[key], 0);
  assert(specs(report).flatMap(spec => spec.tests).every(test => test.status === 'expected' && test.results.length === 1 && test.results[0].status === 'passed'));
}
assert.deepEqual(overview.camera, old.camera, 'Canonical pose, projection and framing must match M6.');
assert.deepEqual(overview.render.viewport, old.render.viewport);
assert.equal(overview.render.dpr, old.render.dpr);
assert.equal(overview.state.seed, old.state.seed);
assert.equal(overview.state.environment.weather, old.state.environment.weather);
assert.equal(overview.state.environment.timeOfDay, old.state.environment.timeOfDay);
assert.equal(overview.facts.backend, 'WebGPU');
assert.equal(fallback.final.facts.backend, 'WebGL2');
assert.deepEqual(production.errors, []);
assert(production.moved > 2);
const traversal = report => {
  assert.equal(report.arrivals.length, 33);
  for (const arrival of report.arrivals) {
    assert(arrival.grounded);
    assert.equal(arrival.resets, 0);
    assert.equal(arrival.identities, 42);
    assert(arrival.loaded.length <= 2);
    assert.deepEqual(arrival.errors, []);
  }
  assert.equal(report.final.state.resets, 0);
  assert(report.final.state.player.grounded);
  assert.deepEqual(report.final.facts.errors, []);
  assert.deepEqual(report.final.streaming.errors, []);
  return { arrivals: report.arrivals.length, activeDistricts: [...new Set(report.arrivals.flatMap(item => item.active))],
    finalPosition: report.final.state.player.position, finalMode: report.final.state.camera.mode,
    resets: report.final.state.resets, uniqueNpcs: report.final.npcTiers.uniqueIds,
    maxLoaded: Math.max(...report.arrivals.map(item => item.loaded.length)), physics: report.final.physics };
};
const differences = [
  'Urban grain: the joined core still has fewer, larger roof clusters and broader courts than the master. The fixed southern anchors and wide garden transition read separately from its continuous fabric.',
  'Waterbank/elevation: the preserved −1.16 m water datum creates deep incised retaining faces. Intermediate quays and stairs help, but bank buildings, bridge openings and planted slopes remain less closely interlocked.',
  'Upper platform/citadel: six towers and staggered support masses strengthen the skyline, while broad rectilinear platforms and simple courts still lack the master’s asymmetric perimeter and vertical roof stacking.',
];
const summary = {
  assembledAt: new Date().toISOString(), milestone: 'M6.1', scene: overview.state.sceneId,
  base: 'f477f6960ae2d291cb6690b1e4d6e7c703b85b78', seed: overview.state.seed,
  canonicalCameraUnchanged: true, camera: overview.camera,
  viewport: overview.render.viewport, dpr: overview.render.dpr,
  browser: overview.facts.browser, backend: overview.facts.backend, adapter: overview.facts.adapter,
  environment: { weather: overview.state.environment.weather, timeOfDay: overview.state.environment.timeOfDay },
  cityInventory: overview.render.city, traversal: traversal(route), webgl2Traversal: traversal(fallback),
  checks: { browser: browser.stats, simulation: simulation.stats, metadata: metadata.stats, finalCityRefresh: refresh.stats, production },
  macroDifferences: differences,
  limits: 'Full headed browser suite passed; metadata-only fixes followed by two passing headless city capture/traversal tests on native backends. Fixed-step traversal and geometry inventory are not frame benchmarks. No new M6.1 cadence measurement; historical M6 timings are preserved separately. Human art approval pending; no M7 or production district generation.',
};
const escape = value => String(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
const files = [
  ['district-map', 'Labeled district map', 'Fourteen stable IDs and the unchanged seventeen-edge graph; intermediate terraces belong to existing districts.'],
  ['castle-lower-city', 'Citadel from the lower city', 'Layered towers, courts and upper support masses above the central-market/civic stair quarters.'],
  ['waterway-network', 'Connected water network', 'Five continuous reaches; middle, upper and headwater widths are now twelve meters.'],
  ['water-network', 'Water corridor from the east', 'A second angle exposes the deep valley and the tighter urban banks.'],
  ['street-1-third-person', 'Central market · third person', 'Reached continuously at about (110,12,−235); the citadel roofline is visible above the civic terrace.'],
  ['street-1-first-person', 'Central market · first person', 'The same grounded position, world and controller at human eye height.'],
  ['street-2-third-person', 'Civic bridge approach · third person', 'At about (180,22,−385), looking along the high crossing toward the temple bank.'],
  ['street-2-first-person', 'Civic bridge approach · first person', 'The bridge corridor remains clear beside the active support mass.'],
  ['street-3-third-person', 'Upper gate · third person', 'At about (185,40,−550), below the wide stairs, intermediate gate terrace and skyline.'],
  ['street-3-first-person', 'Upper gate · first person', 'The same stair sequence and complete landmark volumes from human height.'],
  ['webgl2-first-person', 'Explicit WebGL2 · citadel endpoint', 'Separately initialized fallback completes the entire thirty-three-arrival route in first person.'],
  ['streaming-graph', 'Streaming adjacency', 'Four secondary portals reuse existing neighbors; at most two detail leases remain loaded.'],
  ['district-map-camera', 'Top-down without labels', 'The actual footprint, street density and open-space pattern.'],
  ['exchange-debug', 'Market terraces', 'A local authoring view of lanes and connective massing.'],
  ['civic-debug', 'Civic terraces', 'Stair cuts, embedded gate, buttresses and the western intermediate quarter.'],
  ['temple-debug', 'Temple and bank garden', 'Lower bank street, planted terrain tier and the upper crossing.'],
  ['citadel-debug', 'Citadel courts and perimeter', 'Six towers, staggered courts, walls and the support city; all remain blueprint volumes.'],
];
for (const path of ['docs/reference/city-master.png', `${root}/baseline/master-eagle-eye.png`, `${root}/browser/master-eagle-eye.png`, ...files.map(([name]) => `${root}/browser/${name}.png`)]) assert(existsSync(path), `Missing actual image: ${path}`);
summary.runtimeCaptures = files.length + 1;
writeFileSync(`${root}/evidence-summary.json`, JSON.stringify(summary, null, 2) + '\n');
const figures = files.map(([name, title, caption]) => `<figure><a href="browser/${name}.png"><img src="browser/${name}.png" alt="${escape(title)}" loading="lazy"></a><figcaption><strong>${escape(title)}</strong><span>${escape(caption)}</span></figcaption></figure>`).join('\n');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voxarrium · M6.1 city convergence review</title>
<style>:root{color-scheme:dark;font:16px/1.6 system-ui,sans-serif;background:#101a1b;color:#e6e6dc}*{box-sizing:border-box}body{margin:0}main{max-width:1400px;margin:auto;padding:42px 28px 80px}a{color:#86d4c8;text-underline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:22px;font-size:14px;margin:16px 0 30px}h1{font-size:clamp(32px,5vw,62px);line-height:1.08;letter-spacing:-.04em;margin:8px 0 22px}h2{font-size:26px;letter-spacing:-.02em;margin:50px 0 18px}p{max-width:960px;color:#b9c8c5}.eyebrow{color:#86d4c8;text-transform:uppercase;letter-spacing:.16em;font-size:13px}.metrics{display:flex;gap:16px;flex-wrap:wrap;margin:26px 0}.metrics span{padding:12px 18px;background:#1a2d2e;border-radius:6px}.compare,.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;background:#1a2829;border:1px solid #304143;border-radius:9px;overflow:hidden}img{width:100%;display:block;object-fit:contain;background:#101a1b}.compare img{height:850px}.gallery img{max-height:600px}figcaption{padding:16px 20px}figcaption strong,figcaption span{display:block}figcaption span{font-size:14px;color:#b9c8c5;margin-top:5px}li{margin:14px 0;max-width:1100px}button{font:inherit;background:#243d3c;color:#e6e6dc;padding:9px 16px;border:1px solid #86d4c8;border-radius:5px;cursor:pointer;margin:0 8px 12px 0}button[aria-pressed=true]{background:#86d4c8;color:#101a1b}.links{columns:2}.links li{margin:6px 0}@media(max-width:720px){main{padding:24px 16px}.compare,.gallery{grid-template-columns:1fr}.compare img{height:auto}.links{columns:1}}</style>
<main><div class="eyebrow">Voxarrium / milestone 06.1 / human review</div><h1>A more continuous<br>terraced city.</h1><p>Layout convergence from the approved M6 blueprint: a narrower core, inhabited intermediate tiers, selected secondary circulation and a layered citadel skyline. The accepted rural, River Market and workshop anchors remain fixed. These are actual local runtime captures; production district generation and M7 remain gated.</p>
<nav><a href="/?scene=m6">Play the blueprint</a><a href="#comparison">Master comparison</a><a href="#captures">Districts and streets</a><a href="#verification">Verification</a><a href="/docs/CITY_BLUEPRINT.md">Graph and assumptions</a><a href="/STATUS.md">Full status</a></nav>
<div class="metrics"><span>14 districts · unchanged graph</span><span>545 × 708 m · fixed origin</span><span>7 intermediate terraces</span><span>6 citadel towers</span><span>37 roads · 21 portals</span><span>At most 2 detail leases</span></div>
<h2 id="comparison">Original master / canonical runtime</h2><p>Full images without cropping or a fidelity score. Runtime camera, framing, seed and clear/day state are identical between M6 and M6.1: (−250,950,900), target (120,18,−300), FOV50°, 900×1500 / DPR1, seed 104729. The concept has an uncertain projection and different scope; its original pixels remain under docs.</p>
<button id="show-after" type="button" aria-pressed="true">M6.1 current</button><button id="show-before" type="button" aria-pressed="false">M6 before</button>
<div class="compare"><figure><a href="/docs/reference/city-master.png"><img src="/docs/reference/city-master.png" alt="Original city master artwork"></a><figcaption><strong>Master reference</strong><span>Continuous roof clusters, terraces, monumental stairs and inhabited waterways.</span></figcaption></figure><figure><a id="runtime-link" href="browser/master-eagle-eye.png"><img id="runtime-image" src="browser/master-eagle-eye.png" alt="Current M6.1 canonical city blueprint"></a><figcaption><strong id="runtime-label">M6.1 current blueprint</strong><span>Toggle the preserved M6 capture to inspect layout convergence with the same camera.</span></figcaption></figure></div>
<h2>Three largest remaining macro differences</h2><ol>${differences.map(item => `<li>${escape(item)}</li>`).join('')}</ol>
<h2 id="captures">Districts and human-scale streets</h2><p>The continuous Rapier route reaches ten active district IDs through thirty-three arrivals, ending grounded at (149.98,50.02,−605.02), with zero recovery resets, at most two detail leases and forty-two accepted NPC identities. Three paired street positions expose the same world in both gameplay modes. Click any image for full size.</p><div class="gallery">${figures}</div>
<h2 id="verification">Verification and review gate</h2><p>All 118 simulation tests plus 9 bootstrap checks pass. The complete headed browser suite passes 37/37 without retries or skips. After metadata-only corrections, a focused graph/ownership check and two headless city capture/traversal tests also pass. Final capture backend: initialized native WebGPU AMD/RDNA2; separate WebGL2 traverses the full citadel route in first person. The built production smoke moves ${production.moved.toFixed(2)} m with actual W, switches view with V, selects rain/night through the menu and exposes no development harness or overlay controls.</p>
<p>The proxy overview has ${overview.render.city.visibleDrawObjects} city draw objects and ${overview.render.city.visibleTriangles.toLocaleString()} authored city triangles in the canonical captured state, with duplicate active-area proxies suppressed. Fixed-step routes and captures do not measure frame cadence. M6.1 has no new performance benchmark; historical M6 timing findings are preserved separately. Human artistic acceptance is pending. Stop at this review gate; do not begin M7 automatically.</p>
<ul class="links"><li><a href="evidence-summary.json">Compact evidence summary</a></li><li><a href="browser/capture-states.json">Exact capture states</a></li><li><a href="browser/traversal.json">Continuous native citadel route</a></li><li><a href="browser/webgl2-traversal.json">Full first-person WebGL2 route</a></li><li><a href="browser-suite.json">Complete headed browser report</a></li><li><a href="simulation-suite.json">Complete simulation report</a></li><li><a href="metadata-check.json">Metadata and unchanged graph check</a></li><li><a href="city-refresh-suite.json">Final city capture/traversal refresh</a></li><li><a href="production/production-smoke.json">Built production input smoke</a></li><li><a href="production/production-smoke.png">Built production rain/night capture</a></li><li><a href="/docs/reference/REVIEWS.md">Qualitative review record</a></li><li><a href="/docs/history/M6_STATUS.md">Historical M6 status and timings</a></li></ul></main>
<script>const after=document.querySelector('#show-after'),before=document.querySelector('#show-before'),picture=document.querySelector('#runtime-image'),link=document.querySelector('#runtime-link'),label=document.querySelector('#runtime-label');function show(previous){const src=previous?'baseline/master-eagle-eye.png':'browser/master-eagle-eye.png';picture.src=src;link.href=src;picture.alt=previous?'Preserved M6 canonical blueprint':'Current M6.1 canonical city blueprint';label.textContent=previous?'M6 before convergence':'M6.1 current blueprint';before.setAttribute('aria-pressed',String(previous));after.setAttribute('aria-pressed',String(!previous));}before.addEventListener('click',()=>show(true));after.addEventListener('click',()=>show(false));</script></html>`;
writeFileSync(`${root}/review.html`, html);
console.log(JSON.stringify({ gallery: `${root}/review.html`, runtimeCaptures: summary.runtimeCaptures, browser: browser.stats.expected, simulation: simulation.stats.expected, canonicalCameraUnchanged: true }));
