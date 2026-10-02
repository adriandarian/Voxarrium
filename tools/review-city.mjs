import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Assemble a local review from completed evidence; never manufacture captures.
const root='artifacts/m6';
const read=name=>JSON.parse(readFileSync(`${root}/${name}`,'utf8'));
const states=read('browser/capture-states.json'), route=read('browser/traversal.json');
const city=read('stress/actual-city-circuit.json');
const regression=['clear-day','rain-dusk'].map(preset=>({preset,report:read(`m5-regression/${preset}/stress-report.json`)}));
const baseline=read('m5-baseline/clear-day/stress-report.json');
const latePreparations=regression.reduce((total,item)=>total+item.report.endpoints.reduce((sum,endpoint)=>sum+endpoint.measurement.transitions.readyBeforeBoundaryNeeded.late,0),0);
const observedPreparations=regression.reduce((total,item)=>total+item.report.endpoints.reduce((sum,endpoint)=>sum+endpoint.measurement.transitions.readyBeforeBoundaryNeeded.ahead+endpoint.measurement.transitions.readyBeforeBoundaryNeeded.late,0),0);
const browserInitial=read('browser-suite-initial.json'), cityRerun=read('browser-rerun-paused.json'), browser=read('browser-suite.json');
const simulation=read('simulation-suite.json'), production=read('production/production-smoke.json');
const specs=suite=>[...(suite.specs??[]),...(suite.suites??[]).flatMap(specs)];
const cases=report=>specs(report).flatMap(spec=>spec.tests.map(test=>({key:`${spec.file}|${spec.title}|${test.projectName}`,title:spec.title,...test})));
const verified=new Map();
for(const item of [...cases(browserInitial),...cases(cityRerun),...cases(browser)])verified.set(item.key,item);
const verifiedBrowserCount=verified.size;
assert.equal(browser.stats.unexpected,0);assert.equal(simulation.stats.unexpected,0);
assert.equal(verifiedBrowserCount,cases(browserInitial).length);
assert([...verified.values()].every(test=>test.status==='expected' && test.results.at(-1).status==='passed'),'Every unique browser case must have an actual passing result.');
const overview=states['master-eagle-eye'];
const summary={
  assembledAt:new Date().toISOString(),scene:overview.state.sceneId,seed:overview.state.seed,
  camera:overview.camera,backend:overview.facts.backend,adapter:overview.facts.adapter,
  viewport:overview.render.viewport,dpr:overview.render.dpr,cityInventory:overview.render.city,
  traversal:{arrivals:route.arrivals.length,activeDistricts:[...new Set(route.arrivals.flatMap(item=>item.active))],
    finalPosition:route.final.state.player.position,resets:route.final.state.resets,uniqueNpcs:route.final.npcTiers.uniqueIds},
  cityCircuit:{browser:city.browser,samples:city.measurement.samples,p95:city.measurement.p95,p99:city.measurement.p99,
    maximum:city.measurement.maximum,over33:city.measurement.over33,transitions:{maximum:city.transitions.transitionSpecificMaximumMs,
      largestJobIncludingStartup:city.transitions.largestSchedulerJobMs,
      largestSampledJob:Math.max(0,...city.transitions.reports.filter(report=>report.largestSchedulerJob?.startMs>=city.measurement.start && report.largestSchedulerJob.startMs<=city.measurement.end).map(report=>report.largestSchedulerJob.durationMs)),
      needed:city.transitions.readyBeforeBoundaryNeeded,crossed:city.transitions.readyBeforeBoundary},
    finalLoaded:city.final.streaming.loadedIds,errors:city.errors},
  m5Regression:regression.map(({preset,report})=>({preset,durationMs:report.durationMs,browser:report.browserVersion,
    cycles:report.endpoints.map(endpoint=>({cycle:endpoint.cycle,samples:endpoint.measurement.samples,
      p95:endpoint.measurement.p95,p99:endpoint.measurement.p99,maximum:endpoint.measurement.max,
      transitionMaximum:endpoint.measurement.transitions.transitionSpecificMaximumMs,
      largestJob:endpoint.measurement.transitions.largestSchedulerJobMs,
      needed:endpoint.measurement.transitions.readyBeforeBoundaryNeeded,heap:endpoint.retainedHeap})),errors:report.errors})),
  contemporaryAcceptedBaseline:{revision:baseline.revision,cycles:baseline.cycles,browser:baseline.browserVersion,
    p95:baseline.endpoints[0].measurement.p95,maximum:baseline.endpoints[0].measurement.max,
    needed:baseline.endpoints[0].measurement.transitions.readyBeforeBoundaryNeeded,
    limits:'One clear/day accepted-commit circuit on port 5175; exact runtime and dependency lock, driver URL/circuit-count adaptations only. This is not six matched control circuits or a causal explanation of readiness misses.'},
  checks:{browser:{verifiedUnique:verifiedBrowserCount,initial:browserInitial.stats,cityRefresh:cityRerun.stats,final:browser.stats,
    provenance:'Full headed run: 36 pass and one developer-triggered Vite reload interruption. Headed rerun refreshes both passing M6 cases; the older circuit pauses with capture absent. Final isolated headless correctness run passes that circuit. Original reports remain separate; timings use exclusive headed actual-input runs.'},simulation:simulation.stats,production},
  macroDifferences:[
    'The meter-authored layout reads broader and more open than the compressed portrait: fewer, larger roof clusters and broad courts leave density gaps.',
    'The continuous accepted water datum creates deep incised valleys and long plain retaining walls; the artwork interlocks banks, terraces and bridge architecture more closely.',
    'The citadel is dominant but its three-volume silhouette, sparse perimeter and simple caps do not yet reproduce the many towers and layered forecourt in the artwork.',
  ],
  limits:'Proxy topology/density gate only. Fixed-step capture routes are separate from exclusive actual-keyboard rAF runs. Browser wall cadence is not GPU execution or production-city performance. Owner artistic approval remains pending.',
};
writeFileSync(`${root}/evidence-summary.json`,JSON.stringify(summary,null,2)+'\n');
const escape=text=>String(text).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const files=[
  ['district-map','Labeled districts','Stable IDs and footprint boundaries in the top-down debug view.'],
  ['castle-lower-city','Castle toward lower city','A second composition camera exposes the stepped city and accepted southern anchors.'],
  ['waterway-network','Connected waterway','Five reaches, one accepted datum, four bridge links; turquoise debug emphasis.'],
  ['streaming-graph','Streaming adjacency','Fourteen districts; overview visibility does not activate all detail leases.'],
  ['street-1-third-person','Garden · third person','Reached from the natural rural spawn through accepted market and workshop.'],
  ['street-1-first-person','Garden · first person','The same player position and Rapier world.'],
  ['street-2-third-person','Central ascent · third person','Road space, retaining walls and a northern landmark sightline.'],
  ['street-2-first-person','Central ascent · first person','Human eye height on the same climb.'],
  ['street-3-third-person','Temple / upper bridge · third person','Upper terraces and the elevated crossing.'],
  ['street-3-first-person','Temple / upper bridge · first person','Shared physical controller, no view-specific facade.'],
  ['webgl2-first-person','Explicit WebGL2','Separate initialized fallback and first-person traversal.'],
  ['district-map-camera','Top-down city','Secondary camera, with overlays switched off.'],
  ['exchange-debug','Exchange debug','A local authoring view.'],['civic-debug','Civic debug','A local authoring view.'],
  ['temple-debug','Temple debug','A local authoring view.'],['citadel-debug','Citadel debug','A local authoring view.'],
];
for(const name of ['master-eagle-eye',...files.map(item=>item[0])])assert(existsSync(`${root}/browser/${name}.png`),`Missing actual capture: ${name}`);
const round=value=>Number(value).toFixed(1);
const figures=files.map(([name,title,caption])=>`<figure><a href="browser/${name}.png"><img loading="lazy" src="browser/${name}.png" alt="${escape(title)}"></a><figcaption><strong>${escape(title)}</strong><span>${escape(caption)}</span></figcaption></figure>`).join('\n');
const rows=regression.flatMap(({preset,report})=>report.endpoints.map(endpoint=>`<tr><td>${escape(preset)} ${endpoint.cycle}</td><td>${round(endpoint.measurement.p95)} ms</td><td>${round(endpoint.measurement.max)} ms</td><td>${round(endpoint.measurement.transitions.largestSchedulerJobMs)} ms</td></tr>`)).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voxarrium · M6 city blueprint review</title>
<style>:root{color-scheme:dark;font:16px/1.6 system-ui,sans-serif;background:#101a1b;color:#e6e6dc}*{box-sizing:border-box}body{margin:0}main{max-width:1400px;margin:auto;padding:42px 28px 80px}a{color:#86d4c8;text-underline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:22px;font-size:14px;margin:16px 0 30px}h1{font-size:clamp(32px,5vw,62px);line-height:1.08;letter-spacing:-.04em;margin:8px 0 22px}h2{font-size:26px;letter-spacing:-.02em;margin:50px 0 18px}p{max-width:900px;color:#b9c8c5}.eyebrow{color:#86d4c8;text-transform:uppercase;letter-spacing:.16em;font-size:13px}.metrics{display:flex;gap:16px;flex-wrap:wrap;margin:26px 0}.metrics span{padding:12px 18px;background:#1a2d2e;border-radius:6px}.compare,.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;background:#1a2829;border:1px solid #304143;border-radius:9px;overflow:hidden}img{width:100%;display:block;object-fit:contain;background:#101a1b}.compare img{height:850px}.gallery img{max-height:600px}figcaption{padding:16px 20px}figcaption strong,figcaption span{display:block}figcaption span{font-size:14px;color:#b9c8c5;margin-top:5px}li{margin:14px 0;max-width:1100px}table{border-collapse:collapse;width:100%;max-width:850px}td,th{padding:10px 16px;text-align:left;border-bottom:1px solid #304143}details{margin-top:26px}code{background:#1a2d2e;padding:2px 6px}.links{columns:2}.links li{margin:6px 0}@media(max-width:720px){main{padding:24px 16px}.compare,.gallery{grid-template-columns:1fr}.compare img{height:auto}.links{columns:1}}</style>
<main><div class="eyebrow">Voxarrium / milestone 06 / human review</div><h1>The terraced city.<br>A walkable macro-blueprint.</h1><p>Fourteen districts connect the accepted rural slice, River Market and workshop to a 50 m citadel plateau. This review asks whether the topology, water, elevation and landmark hierarchy provide the right foundation for production districts. The images below are actual local runtime captures.</p>
<nav><a href="/?scene=m6">Play M6</a><a href="#comparison">Master comparison</a><a href="#captures">Districts & streets</a><a href="#measurements">Measurements</a><a href="/docs/CITY_BLUEPRINT.md">Graph & assumptions</a><a href="/STATUS.md">Full status</a></nav>
<div class="metrics"><span>14 districts · 17 connections</span><span>26 roads · 4 bridge links</span><span>At most 2 detail leases</span><span>${verifiedBrowserCount} unique browser checks verified</span></div>
<h2 id="comparison">Original artwork / canonical runtime</h2><p>The concept does not establish exact dimensions or projection. Both are shown in full, without a numerical fidelity score. Runtime: seed ${summary.seed}, ${escape(summary.backend)} AMD/RDNA2, 900×1500 / DPR1, clear/day. Camera (−250,950,900), target (120,18,−300), FOV50°.</p>
<div class="compare"><figure><a href="/docs/reference/city-master.png"><img src="/docs/reference/city-master.png" alt="Original Voxarrium master artwork"></a><figcaption><strong>Master reference</strong><span>Original file, retained under docs; no source image is shipped as a game texture.</span></figcaption></figure><figure><a href="browser/master-eagle-eye.png"><img src="browser/master-eagle-eye.png" alt="Actual M6 canonical eagle-eye blueprint"></a><figcaption><strong>M6 macro-blueprint</strong><span>Terraces, coherent water, capped landmarks and ${overview.render.city.massingInstances/2} representative block bodies. Eagle-eye is an art camera; gameplay stays human scale.</span></figcaption></figure></div>
<h2>Three largest macro differences</h2><ol>${summary.macroDifferences.map(item=>`<li>${escape(item)}</li>`).join('')}</ol>
<h2 id="captures">Districts and human-scale streets</h2><p>The route reaches the citadel at ${round(summary.traversal.finalPosition.y)} m through ${summary.traversal.activeDistricts.length} active district IDs, with zero recovery resets and 42 unique accepted NPC identities. Captures use deterministic fixed-step controller input and ordinary streaming; they are geometry/lifecycle evidence. The actual-keyboard circuit below measures cadence separately. Click an image for its full size.</p><div class="gallery">${figures}</div>
<h2 id="measurements">Bounded local measurements</h2><p>Chrome ${escape(city.browser)}, RX 6950 XT, initialized WebGPU, 1920×1080 / DPR1. One M6 rural → central market → rural actual W+Shift circuit: p95 ${round(city.measurement.p95)} ms; maximum ${round(city.measurement.maximum)} ms; ${city.measurement.samples.toLocaleString()} sampled rAF intervals. The return uses first person. Proxy-city cadence does not predict production-city performance.</p>
<p>The M5.1 comparison retains the original three-area corridor, scheduler and retirement radii. Each preset repeats three actual-keyboard circuits. These measurements include browser/CPU wall time; GPU execution, VRAM, physical presentation and lower-end hardware remain unmeasured.</p><table><thead><tr><th>M5.1 regression</th><th>p95</th><th>Maximum interval</th><th>Largest scheduler job</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>Preparation-margin review risk:</strong> ${latePreparations} of ${observedPreparations} preparations finish after the boundary-needed milestone in these six circuits. All exact crossings wait for readiness, with stable two-lease ownership and resource returns. The historical accepted M5.1 runs had zero such misses. A separate single circuit of the unchanged accepted commit today records p95 ${round(baseline.endpoints[0].measurement.p95)} ms and maximum ${round(baseline.endpoints[0].measurement.max)} ms, with all four preparations ahead; it reproduces the larger frame tail, but does not explain the readiness misses or isolate their full cause. The current six-circuit result is not claimed equivalent to that historical baseline.</p>
<h2>Evidence and review gate</h2><p>${simulation.stats.expected} simulation checks and 9 bootstrap checks pass; production smoke moves ${round(production.moved)} m with actual W and verifies V/Esc, pointer capture, rain/night and absence of development controls. All ${verifiedBrowserCount} unique browser cases have passing results across the full run and focused reruns. The initial circuit was interrupted by a developer-triggered dev-server reload; a desktop rerun paused with capture absent. That deterministic ownership case then passes headless, while both refreshed city cases pass headed. Actual timing remains separate and headed. Owner art/feel approval is pending. Stop at M6: production city generation is not started.</p>
<ul class="links"><li><a href="evidence-summary.json">Compact evidence summary</a></li><li><a href="browser/capture-states.json">Exact capture states</a></li><li><a href="browser/traversal.json">Continuous citadel route</a></li><li><a href="browser/webgl2-traversal.json">Explicit WebGL2 route</a></li><li><a href="stress/actual-city-circuit.json">Actual city circuit / full frame chronology</a></li><li><a href="m5-regression/clear-day/stress-report.json">M5.1 clear/day regression</a></li><li><a href="m5-regression/rain-dusk/stress-report.json">M5.1 rain/dusk regression</a></li><li><a href="m5-baseline/clear-day/stress-report.json">Contemporary accepted-commit control circuit</a></li><li><a href="m5-regression/clear-day-partial/failure.json">Excluded earlier pointer-capture interruption</a></li><li><a href="browser-suite-initial.json">Full browser report / retained reload interruption</a></li><li><a href="browser-rerun-paused.json">Refreshed city cases / retained desktop pause</a></li><li><a href="browser-suite.json">Isolated M5 ownership rerun</a></li><li><a href="simulation-suite.json">Simulation test report</a></li><li><a href="production/production-smoke.json">Built production smoke</a></li></ul></main></html>`;
writeFileSync(`${root}/review.html`,html);
console.log(JSON.stringify({gallery:`${root}/review.html`,captures:files.length+1,verifiedUniqueBrowserCases:verifiedBrowserCount,simulation:simulation.stats.expected}));
