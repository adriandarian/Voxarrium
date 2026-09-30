import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const directory='artifacts/m4-1';
const captured=JSON.parse(readFileSync(`${directory}/final/capture-states.json`));
const baseline=JSON.parse(readFileSync('artifacts/m4/final/capture-states.json'));
const views=Object.entries(captured.states).map(([name,s])=>({name,
  after:`final/${name}.png`,before:existsSync(`artifacts/m4/final/${name}.png`)?`../m4/final/${name}.png`:null,
  sameCamera:baseline.states[name]?JSON.stringify(baseline.states[name].camera)===JSON.stringify(s.camera):false,
  state:{mode:s.state.camera.mode,feet:s.state.player.position,weather:s.state.environment.weather,
    light:s.state.environment.timeOfDay,camera:s.camera,backend:s.facts.backend,viewport:s.render.viewport,
    draws:s.render.drawCalls,triangles:s.render.triangles,npcs:s.render.living.activeNpcs}}));
const captions={
  'eagle-eye':'Existing 27 lots, raised guild hall, streets, canal and bridges. New details stay within this footprint.',
  'primary-street':'Opening profiles, shop awning/sign rhythms, edge aprons and a worn stone walking band.',
  market:'Bakery and pottery stands, grouped stock and baskets; central crossing stays clear.',
  'first-person-alley':'Side-wall service props, utility hood, repairs and drainage. The full walking/camera width is tested.',
  'third-person-alley':'The same dressed passage in the follow camera; real full-circuit clearance is tested separately.',
  'market-goods':'Closer trade display inspection. Textiles and produce occupy the southern stands.',
  'canal-waterline':'Repaired parapet courses, mooring collars and waterline patina on the existing canal.',
  'quay-service':'Localized loading pockets and old repairs at the retaining wall, leaving the quay path open.',
  night:'Five existing local lights total, zero local shadows. Warm pavement bounce is an authored emissive approximation.',
  rain:'Shared M3 rain/wetness and the same primary-street view; no new weather system.',
};
const runs=['performance','trace','rain'].map(name=>{
  const r=JSON.parse(readFileSync(`${directory}/${name}/performance-route-60s.json`));
  const b=JSON.parse(readFileSync(`artifacts/m4/${name}/performance-route-60s.json`));
  return {name,mean:r.meanFrameMs,fps:r.fps,p95:r.p95FrameMs,p99:r.p99FrameMs,max:r.maxFrameMs,long:r.framesOver33ms,
    before:{p95:b.p95FrameMs,max:b.maxFrameMs,long:b.framesOver33ms}};
});
const trace=JSON.parse(readFileSync(`${directory}/trace/trace-findings.json`));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>River Market — M4.1 art review</title>
<style>:root{color-scheme:dark;font:15px/1.5 system-ui;color:#e8e1ce;background:#171e1a}body{margin:0}header,main{padding:24px 32px}header{border-bottom:1px solid #49594b}h1{font:32px Georgia;margin:5px 0}.tag{font-size:11px;letter-spacing:.15em;color:#b5c7ac}a{color:#bfd6b2}button,select{font:inherit;background:#2e4033;color:#f4eedc;border:1px solid #6e8469;padding:9px 13px}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}figure{margin:0}img{width:100%;object-fit:contain;background:#28352c}figcaption{color:#aabd9e}pre{font:12px/1.5 monospace;white-space:pre-wrap;max-height:240px;overflow:auto}table{border-collapse:collapse;width:100%}td,th{padding:9px;text-align:left;border-bottom:1px solid #445544}.risk{color:#dbc5a5}@media(max-width:1000px){.pair{grid-template-columns:1fr}header,main{padding:20px}}</style>
<header><div class="tag">M4.1 · HUMAN ART REVIEW PENDING</div><h1>River Market — urban art convergence</h1><p>27 buildings · six archetypes · 42 locals · same district footprint. Actual Chrome ${captured.browserVersion} runtime captures. M5 remains gated.</p><a href="/">Play</a> · <a href="../../STATUS.md">Status</a> · <a href="final/capture-states.json">Recorded capture conditions</a></header>
<main><nav><button id="prev">← Previous</button><label for="view">View</label><select id="view"></select><button id="next">Next →</button><label><input type="checkbox" id="compare" checked> Show M4 baseline</label></nav>
<div class="pair"><figure id="baseline"><figcaption>M4 baseline</figcaption><img id="before" alt="M4 baseline"></figure><figure><figcaption>M4.1 candidate</figcaption><img id="after" alt=""></figure></div><p id="caption"></p><p id="camera" class="tag"></p><details><summary>Actual candidate conditions</summary><pre id="state"></pre></details>
<p class="risk">Remaining: small shared carpentry vocabulary, parallel building rows and open quays, course-like paving in places, simplified nonblocking locals and diagnostic player capsule. Human artistic acceptance remains pending.</p>
<h2>Three bounded 60-second walks</h2><table><tr><th>Run</th><th>Mean ms / FPS</th><th>p95 / p99 ms</th><th>Max ms</th><th>&gt;33.3 ms</th><th>M4 p95 / max / long</th></tr>${runs.map(r=>`<tr><td>${r.name}</td><td>${r.mean.toFixed(3)} / ${r.fps.toFixed(2)}</td><td>${r.p95.toFixed(2)} / ${r.p99.toFixed(2)}</td><td>${r.max.toFixed(1)}</td><td>${r.long}</td><td>${r.before.p95.toFixed(1)} / ${r.before.max.toFixed(1)} / ${r.before.long}</td></tr>`).join('')}</table>
<p>1920×1080 / DPR 1, headed WebGPU, actual W input with waypoint steering after warmup. Trace has overhead. rAF wall intervals include browser/automation/scheduling; they are not GPU time. Repeated long intervals remain; these small samples do not establish a causal change.</p><p>Traced maximum game callback ${trace.maxGameCallbackMs.toFixed(3)} ms; maximum recorded main-thread GC ${trace.maxMainGcMs?.toFixed(3)??'unavailable'} ms. GPU and OS timing are absent. No speculative renderer or simulation rewrite.</p>
<p><a href="browser-suite.json">Browser results</a> · <a href="simulation-suite.json">Simulation results</a> · <a href="trace/trace-findings.json">Trace summary</a> · <a href="final/route-third-person.json">Third-person circuit</a> · <a href="final/route-first-person.json">First-person circuit</a> · <a href="final/production-smoke.json">Production controls</a></p><p class="tag">STOP AT HUMAN REVIEW · NO M5 / FULL CITY</p></main>
<script>const views=${JSON.stringify(views)},captions=${JSON.stringify(captions)};const select=document.getElementById('view'),compare=document.getElementById('compare');views.forEach((v,i)=>select.add(new Option(v.name.replaceAll('-',' '),i)));function show(i){i=(i+views.length)%views.length;select.value=i;const v=views[i];document.getElementById('after').src=v.after;document.getElementById('after').alt=v.name;document.getElementById('before').src=v.before||v.after;document.getElementById('baseline').hidden=!compare.checked||!v.before;document.querySelector('.pair').style.gridTemplateColumns=compare.checked&&v.before?'':'1fr';document.getElementById('caption').textContent=captions[v.name]||'Actual runtime inspection view.';document.getElementById('camera').textContent=v.before?(v.sameCamera?'Recorded camera matches M4 baseline.':'Camera poses differ; inspect composition without a pixel-diff claim.'):'Additional candidate inspection pose; no matched M4 view.';document.getElementById('state').textContent=JSON.stringify(v.state,null,2);}select.onchange=()=>show(+select.value);compare.onchange=()=>show(+select.value);document.getElementById('prev').onclick=()=>show(+select.value-1);document.getElementById('next').onclick=()=>show(+select.value+1);show(0);</script></html>`;
writeFileSync(`${directory}/review.html`,html);
console.log(`Saved ${directory}/review.html with ${views.length} actual views and three measured walks.`);
