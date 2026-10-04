import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Build this only after measured runs. The page replays exported observations;
// it never starts the game or contributes to its measured frame intervals.
const root='artifacts/m8',read=path=>JSON.parse(readFileSync(`${root}/${path}`,'utf8'));
const presets=['clear-day','rain-dusk'];
const directories=[process.argv[2]??'stress/clear-day',process.argv[3]??'stress/rain-dusk'];
const runs=presets.map((preset,index)=>{
  const reportPath=`${directories[index]}/stress-report.json`,report=read(reportPath);
  assert.equal(report.cycles,3,`${preset} requires three complete circuits`);
  assert.equal(report.endpoints.length,3);assert.deepEqual(report.errors,[]);
  assert.equal(report.runtimeSourceSha256,runtimeSourceSnapshot().sha256,'Review requires the current runtime source');
  assert(report.acceptance.fullTraversalTailWithinM8Limit,`${preset} failed full traversal tail gate`);
  assert(report.acceptance.transitionTailWithinM8Limit,`${preset} failed transition gate`);
  assert(report.acceptance.readyBeforeNeeded&&report.acceptance.readyBeforeCrossing,`${preset} failed preparation readiness`);
  assert(report.acceptance.allCoreWardsVisited,`${preset} did not visit every core ward`);
  return {preset,reportPath,source:report.runtimeSourceSha256,cycles:report.cycles,durationMs:report.durationMs,
    points:report.checkpoints.map(c=>({time:c.elapsedMs,cycle:c.cycle,waypoint:c.waypoint,position:c.state.player.position,
      loaded:c.streaming.loadedIds,active:c.streaming.activeIds,tiers:c.npcTiers,mode:c.state.camera.mode})),
    arrivals:report.arrivals.map(c=>({time:c.elapsedMs,cycle:c.cycle,waypoint:c.waypoint,position:c.position,loaded:c.loaded,tiers:c.npcTiers})),
    intervals:report.endpoints.map(e=>({p50:e.measurement.p50,p95:e.measurement.p95,p99:e.measurement.p99,max:e.measurement.max,
      transitionMax:e.measurement.transitions.transitionSpecificMaximumMs,jobMax:e.measurement.transitions.largestSchedulerJobMs,
      retainedHeap:e.retainedHeap.used})),
    districts:report.baseline.city.districts,coreIds:report.baseline.city.coreIds,route:report.route};
});
const captures=read('browser/capture-states.json');
const motion=read('motion-final/evidence.json');
const waterfront=read('waterfront-review/capture-state.json');
const alley=read('alley-review/capture-state.json');
assert.equal(runs[0].source,runs[1].source);assert.equal(runs[0].source,motion.sourceSha256);
assert.equal(runs[0].source,captures.sourceSha256);
assert.equal(runs[0].source,waterfront.sourceSha256);
assert.equal(runs[0].source,alley.sourceSha256);
const names=Object.keys(captures.states);
for(const name of names)assert(existsSync(`${root}/browser/${name}.png`),name);
for(const c of motion.clips)assert(existsSync(`${root}/motion-final/${c.id}-${c.name}.webm`));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const images=names.map(name=>`<figure><a href="browser/${esc(name)}.png"><img loading="lazy" src="browser/${esc(name)}.png" alt="${esc(name)}"></a><figcaption>${esc(name)} · active ${esc(captures.states[name].streaming.activeIds.join(', '))}</figcaption></figure>`).join('')+
  '<figure><a href="waterfront-review/first-person-waterfront-outward.png"><img loading="lazy" src="waterfront-review/first-person-waterfront-outward.png" alt="First-person outward waterfront"></a><figcaption>First-person outward waterfront · separate explicit inspection setup; complements the landward quay view.</figcaption></figure>'+
  '<figure><a href="alley-review/first-person-service-alley.png"><img loading="lazy" src="alley-review/first-person-service-alley.png" alt="First-person enclosed stock alley"></a><figcaption>First-person enclosed stock alley · preserved M7 Central Market architecture in M8; separate explicit setup.</figcaption></figure>';
const videos=motion.clips.map(c=>`<figure><video controls preload="metadata" src="motion-final/${esc(c.id)}-${esc(c.name)}.webm"></video><figcaption>${esc(c.id)} / ${esc(c.name)} · ${esc(c.mode)} · ${(c.recordedDurationMs/1000).toFixed(1)} seconds. Explicit setup; recording excluded from timing.</figcaption></figure>`).join('');
for(const path of ['docs/reference/city-master.png','artifacts/m2-1/iteration-03/eagle-eye-clean.png','artifacts/m4/refined/primary-street.png','artifacts/m7/browser-final/central-market-street.png'])assert(existsSync(path),path);
const data={runs};
writeFileSync(`${root}/long-route-data.json`,JSON.stringify(data)+'\n');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Voxarrium M8 evidence</title>
<style>body{margin:0;background:#142327;color:#edf0df;font:16px/1.5 system-ui}main{max-width:1350px;margin:auto;padding:32px}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:42px}a{color:#ead499}p{max-width:950px}section{margin:36px 0}figure{margin:0;background:#213337;border:1px solid #425257}figcaption{padding:12px;font-size:14px}img,video{width:100%;display:block} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:18px} .route{display:grid;grid-template-columns:minmax(400px,2fr) minmax(260px,1fr);gap:18px} svg{background:#263d41;width:100%;height:530px}pre{white-space:pre-wrap;font:14px/1.5 monospace}button,select{background:#ead499;color:#13252a;border:0;padding:10px;margin:8px 8px 8px 0}input{width:100%}small{color:#bed0c6}@media(max-width:800px){.grid,.route{display:block}figure{margin-bottom:18px}}</style>
<main><h1>Seven connected wards</h1><p>M8 agentic evidence, with human art review intentionally deferred. Six wards have detailed production architecture; Workshop Forecourt remains the accepted proxy connector. Unloaded wards use coarse silhouettes and overview images contain mixed detail levels.</p>
<p>Runtime source: <code>${esc(runs[0].source)}</code>. <a href="../../docs/reference/city-master.png">Original city master</a> · <a href="browser/capture-states.json">Capture states</a> · <a href="motion-final/evidence.json">Motion states</a>.</p>
<section><h2>Long-route traversal</h2><p>This map replays actual measured keyboard-input observations at approximately ten-second checkpoints, with exact waypoint arrivals preserved in the JSON. Position interpolation is a visual aid; the map is an evidence viewer, not a game recording. No bookmarks, teleports, deterministic stepping or reloads occurred during these six circuits.</p>
<select id="preset"><option>clear-day</option><option>rain-dusk</option></select><button id="play">Play observations</button><button id="reset">Reset viewer</button><input id="time" type="range" min="0" step="1000" value="0" aria-label="Measured elapsed time">
<div class="route"><svg id="map" viewBox="-90 -475 530 540" aria-label="Recorded city route"><g id="wards"></g><path id="planned" fill="none" stroke="#829b96" stroke-width="1.2" stroke-dasharray="3 3"></path><path id="walked" fill="none" stroke="#efcf8c" stroke-width="1.8"></path><circle id="player" r="4" fill="#ff785e"></circle></svg><div><pre id="state"></pre><p id="metrics"></p><small>rAF intervals are browser wall time; heap is forced-GC JavaScript ownership observation. Neither is GPU time or VRAM.</small></div></div>
<p>${runs.map(r=>`<a href="${esc(r.reportPath)}">${r.preset} complete report</a>`).join(' · ')} · <a href="long-route-data.json">Compact observation data</a></p></section>
<section><h2>Captured views</h2><p>The 20 browser-suite view bookmarks follow its continuous controller routes. Two supplementary alley/waterfront views use separate explicit inspection setups. Streets, court approaches, enclosed alley, entrances, day/night/rain eagle views and loaded/resident debug state are preserved separately from measured stress.</p><div class="grid">${images}</div></section>
<section><h2>Moving street review</h2><div class="grid">${videos}</div></section>
<section><h2>Master and earlier runtime context</h2><div class="grid"><figure><img src="../../docs/reference/city-master.png" alt="Master reference"><figcaption>Original master reference; incomplete three-dimensional art direction.</figcaption></figure><figure><img src="../m2-1/iteration-03/eagle-eye-clean.png" alt="Accepted rural runtime"><figcaption>Accepted rural runtime</figcaption></figure><figure><img src="../m4/refined/primary-street.png" alt="Earlier district street"><figcaption>Earlier M4 runtime street</figcaption></figure><figure><img src="../m7/browser-final/central-market-street.png" alt="M7 market street"><figcaption>M7 runtime market street</figcaption></figure></div></section>
<section><h2>Remaining art differences</h2><p>1. The hero upper-city skyline remains proxy-scale: coherent citadel and multi-part landmark roofs belong to M9. 2. The master packs terraces and inhabited edges more tightly; M8 still shows broad public shoulders and simplified retaining faces. 3. Canal geometry is connected and traversable, but its angular banks, repeating domestic bays and quiet local activity still lack the master's layered waterfront and street richness. See the factual audit in docs/reference/REVIEWS.md. No visual score or owner acceptance is asserted.</p></section></main>
<script>const data=${JSON.stringify(data).replaceAll('<','\\u003c')};const el=id=>document.getElementById(id);let running=false,previous=0,playhead=0;const path=points=>points.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ');
function renderWards(run,observation){const group=el("wards");group.replaceChildren();for(const district of run.districts.filter(d=>run.coreIds.includes(d.id)||d.id==="rural")){const active=observation.active.includes(district.id),loaded=observation.loaded.includes(district.id);const polygon=document.createElementNS("http://www.w3.org/2000/svg","polygon");polygon.setAttribute("points",district.footprint.map(p=>p.x+","+p.z).join(" "));polygon.setAttribute("fill",active?"#587e63":loaded?"#546e89":"#344b50");polygon.setAttribute("stroke","#78908b");polygon.setAttribute("stroke-width",".6");const label=document.createElementNS("http://www.w3.org/2000/svg","text");label.setAttribute("x",district.center.x);label.setAttribute("y",district.center.z);label.setAttribute("text-anchor","middle");label.setAttribute("fill","#d9e0d6");label.setAttribute("font-size","7");label.textContent=district.name;group.append(polygon,label);}}
function render(){const run=data.runs[el('preset').selectedIndex],time=Number(el('time').value);el('time').max=run.durationMs;const points=run.points.filter(p=>p.time<=time),p=points.at(-1)||run.points[0],next=run.points.find(q=>q.time>time);let x=p.position.x,z=p.position.z;if(next&&time>=p.time){const alpha=(time-p.time)/(next.time-p.time);x+=(next.position.x-x)*alpha;z+=(next.position.z-z)*alpha;}renderWards(run,p);el('player').setAttribute('cx',x);el('player').setAttribute('cy',z);el('planned').setAttribute('d',path(run.route));el('walked').setAttribute('d',path(points.map(q=>[q.position.x,q.position.z])));el('state').textContent=JSON.stringify({preset:run.preset,elapsedSeconds:(time/1000).toFixed(1),observedCycle:p.cycle+1,waypoint:p.waypoint,position:p.position,mode:p.mode,loaded:p.loaded,active:p.active,npcTiers:p.tiers},null,2);el('metrics').textContent=run.intervals.map((v,i)=>'Circuit '+(i+1)+': p50/p95/p99 '+[v.p50,v.p95,v.p99].map(n=>n.toFixed(1)).join('/')+' ms; max '+v.max.toFixed(1)+'; transition '+v.transitionMax.toFixed(1)+'; retained JS '+(v.retainedHeap/1e6).toFixed(2)+' MB').join(' | ');}
el('time').oninput=()=>{playhead=Number(el('time').value);render();};el('preset').onchange=()=>{playhead=0;el('time').value=0;render();};el('play').onclick=()=>{playhead=Number(el('time').value);running=!running;el('play').textContent=running?'Pause viewer':'Play observations';};el('reset').onclick=()=>{playhead=0;el('time').value=0;render();};function tick(now){if(running&&previous){playhead=Math.min(Number(el('time').max),playhead+(now-previous)*60);el('time').value=playhead;render();if(playhead>=Number(el('time').max)){running=false;el('play').textContent='Play observations';}}previous=now;requestAnimationFrame(tick);}render();requestAnimationFrame(tick);</script></html>`;
writeFileSync(`${root}/review.html`,html);
console.log(JSON.stringify({page:`${root}/review.html`,captures:names.length+2,clips:motion.clips.length,circuits:runs.reduce((n,r)=>n+r.cycles,0),source:runs[0].source}));
