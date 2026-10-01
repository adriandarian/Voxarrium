import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { summarizeTransitions } from './streaming-transition-summary.mjs';

// Bounded actual-input soak. No teleports, bookmarks, deterministic stepping or reloads.
const weather = process.env.VOXARRIUM_WEATHER ?? 'rain';
const light = process.env.VOXARRIUM_LIGHT ?? (weather === 'rain' ? 'dusk' : 'day');
if (!['clear', 'rain'].includes(weather) || !['day', 'dusk'].includes(light)) throw new Error('Streaming stress supports clear/rain and day/dusk presets.');
const directory = resolve(process.env.VOXARRIUM_STREAMING_DIR ?? `artifacts/m5-1/stress/${weather}-${light}`);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceStatus = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
const cycles = 3;
const outward = [[5,-1],[5,-10],[38,-10],[52,-10],[69,-9],[89,-12],[111,-11],[145,-10],[206,-10]];
const route = [...outward, ...outward.slice(0,-1).reverse(),[-6,1.5]];
mkdirSync(directory,{recursive:true});
const write = (name,value) => writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const browser = await chromium.launch({channel:process.env.VOXARRIUM_BROWSER ?? 'chrome',headless:false});
const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page = await context.newPage();
const errors=[], checkpoints=[], endpoints=[], arrivals=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let report;
try {
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.addInitScript(()=>{
    const events=window.__stressControlEvents=[];
    const record=type=>{if(events.length<128)events.push({type,timeMs:performance.now(),focused:document.hasFocus(),
      visibility:document.visibilityState,pointerLocked:document.pointerLockElement?.id==='world'});};
    for(const type of ['focus','blur'])window.addEventListener(type,()=>record(type));
    for(const type of ['visibilitychange','pointerlockchange','pointerlockerror'])document.addEventListener(type,()=>record(type));
    document.addEventListener('keydown',event=>{if(event.code==='Escape')record('Escape');});
  });
  await page.goto('http://127.0.0.1:5173/?test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:90000});
  await page.locator('#living-settings').evaluate(el=>{el.open=true;});
  for(const [category,value] of Object.entries({master:.4,ambience:.55,footsteps:.65,locals:.45})) {
    await page.locator(`#volume-${category}`).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  }
  await page.bringToFront();
  await page.locator('#start').click();
  const controlsState=()=>page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState,
    pointerLocked:document.pointerLockElement?.id==='world',notice:document.querySelector('#notice')?.textContent,
    paused:window.__VOXARRIUM__?.snapshot().state.paused}));
  write('startup-controls.json',await controlsState());
  try { await page.waitForFunction(()=>document.pointerLockElement?.id==='world'); }
  catch(error) { write('startup-controls-failure.json',await controlsState());await page.screenshot({path:resolve(directory,'startup-controls-failure.png')});throw error; }
  await page.evaluate(({weather,light})=>{const h=window.__VOXARRIUM__;h.environment(weather,light,true);h.freeze(false);},{weather,light});
  await page.waitForTimeout(3000);
  const snapshot=(chronology=true)=>page.evaluate(chronology=>{
    const s=window.__VOXARRIUM__.snapshot();
    s.measurementControls={focused:document.hasFocus(),visibility:document.visibilityState,
      pointerLocked:document.pointerLockElement?.id==='world',events:window.__stressControlEvents};
    // Periodic state assertions need aggregates, not a multi-megabyte transfer
    // of every previous request row. Complete chronology is exported at returns.
    if(!chronology)s.tail={maxIntervalMs:s.tail.maxIntervalMs,spans:s.tail.spans,dropped:s.tail.dropped};
    return s;
  },chronology);
  const heap=async()=>{
    const {metrics}=await cdp.send('Performance.getMetrics');
    const values=Object.fromEntries(metrics.map(m=>[m.name,m.value]));
    return {used:values.JSHeapUsedSize,total:values.JSHeapTotalSize,source:'Chrome CDP Performance metrics; JavaScript heap, not VRAM'};
  };
  const baseline=await snapshot();
  // GC is diagnostic at stationary endpoints, outside interval sampling. Both raw/retained heaps are reported.
  const baselineRawHeap=await heap();
  await cdp.send('HeapProfiler.collectGarbage');
  const baselineRetainedHeap=await heap();
  const ids=baseline.state.population.map(n=>n.id);
  function validate(s) {
    assert.equal(s.state.resets,0); assert.equal(s.state.paused,false);
    assert.equal(s.measurementControls.focused,true);assert.equal(s.measurementControls.visibility,'visible');
    assert.equal(s.measurementControls.pointerLocked,true);
    assert(s.state.player.position.y>3.97);assert.equal(s.state.player.grounded,true);
    assert.deepEqual(s.state.population.map(n=>n.id),ids); assert.equal(s.npcTiers.uniqueIds,42);
    assert.deepEqual(s.streaming.errors,[]);assert.equal(s.state.environment.weather,weather);
    assert.equal(s.state.environment.timeOfDay,light);assert.deepEqual(s.settings.audio,baseline.settings.audio);
    assert.equal(s.audio.activeLoops,5);assert(s.audio.activeVoices<=5);
    assert(s.streaming.loadedIds.length<=2,'Loaded-area policy exceeded two areas.');
    const cache=s.render.streamingResources.cache;
    if(cache){assert(cache.entries<=cache.capacity);assert.equal(cache.disposed,false);}
    assert.equal((s.render.textureEvents??[]).filter(event=>event.event==='recreated').length,0,'Disposed GPU texture was recreated.');
    for(const id of ['rural','river-market','neighbor-shell']) assert.equal(!!s.physics.areas[id],s.streaming.activeIds.includes(id));
  }
  async function beginSample() {
    await page.evaluate(()=>{
      window.__VOXARRIUM__.resetTail();
      const m=window.__streamingMeasure={frames:[],capacity:60000,dropped:0,start:performance.now(),last:null,active:true};
      const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<m.capacity)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}m.last=now;requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
    });
  }
  async function endSample() {
    return page.evaluate(()=>{
      const m=window.__streamingMeasure;m.active=false;
      const sorted=m.frames.map(f=>f.interval).filter(v=>v>0).sort((a,b)=>a-b);
      const p=n=>sorted[Math.ceil(sorted.length*n)-1];
      return {startMs:m.start,endMs:performance.now(),samples:sorted.length,p50:p(.5),p95:p(.95),p99:p(.99),max:sorted.at(-1),over33:sorted.filter(n=>n>33.3).length,dropped:m.dropped,longFrames:m.frames.filter(f=>f.interval>33.3),frames:m.frames};
    });
  }
  let nextCheckpoint=0;
  const start=Date.now();
  for(let cycle=0;cycle<cycles;cycle++) {
    await page.evaluate(cycle=>window.__VOXARRIUM__.mode(cycle===1?'first-person':'third-person'),cycle);
    await beginSample();
    for(const [index,target] of route.entries()) {
      const legStart=Date.now();
      await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
      for(;;) {
        assert(Date.now()-start<600000,'Bounded stress exceeded ten minutes');
        assert(Date.now()-legStart<35000,`Navigation stalled cycle ${cycle}, waypoint ${index}`);
        const result=await page.evaluate(([x,z])=>{
          const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);
          return {distance:Math.hypot(p.x-x,p.z-z),p};
        },target);
        if(result.distance<.55)break;
        if(Date.now()-start>=nextCheckpoint) {
          const s=await snapshot(false);validate(s);
          const {tail,...state}=s;
          checkpoints.push({elapsedMs:Date.now()-start,cycle,waypoint:index,...state,tailSummary:{maxIntervalMs:tail.maxIntervalMs,spans:tail.spans,dropped:tail.dropped},heap:await heap()});
          nextCheckpoint+=10000;
          console.log(JSON.stringify({elapsedMs:Date.now()-start,cycle,waypoint:index,position:s.state.player.position,loaded:s.streaming.loadedIds}));
        }
        await page.waitForTimeout(80);
      }
      await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
      if(target[0]===206 || index===route.length-1) await page.waitForTimeout(2200);
      const s=await snapshot(false);validate(s);
      arrivals.push({cycle,waypoint:index,elapsedMs:Date.now()-start,position:s.state.player.position,environmentTime:s.state.environment.time,loaded:s.streaming.loadedIds,npcTiers:s.npcTiers,counts:s.streaming.counts});
      if(target[0]===206) {
        assert.deepEqual(s.streaming.loadedIds,['neighbor-shell']);assert.equal(s.npcTiers.counts['unloaded-data'],42);
        assert.equal(s.audio.districtEmitters.enabled,0);assert.equal(s.audio.levels.market,0);
      }
    }
    const measurement=await endSample();
    // Compare equivalent stationary third-person endpoint ownership, including
    // the same visible avatar material. The traversed first-person cycle remains measured.
    await page.evaluate(()=>window.__VOXARRIUM__.mode('third-person'));
    await page.waitForTimeout(200);
    const s=await snapshot();validate(s);assert.equal(measurement.dropped,0);
    assert(s.tail.transitions?.enabled,'Transition diagnostics are required for M5.1 stress.');
    measurement.transitions = summarizeTransitions(s.tail.transitions,measurement.frames,measurement.startMs,measurement.endMs);
    write(`cycle-${cycle}-measurement.json`,measurement);
    assert.deepEqual(s.streaming.loadedIds,['rural']);
    const plateau=endpoints[0]?.snapshot??s;
    assert.deepEqual(s.render.streamingResources.render,plateau.render.streamingResources.render);
    assert.deepEqual(s.render.streamingResources.assets,plateau.render.streamingResources.assets);
    assert.deepEqual(Object.keys(s.render.streamingResources.assets.ids).sort(),['rural.bridge','rural.cottage','rural.shed']);
    assert.deepEqual(s.physics,plateau.physics);
    assert.equal(s.physics.bodies,baseline.physics.bodies);
    assert.deepEqual(s.physics.areas,baseline.physics.areas);
    assert.equal(s.render.geometries,plateau.render.geometries);assert.equal(s.render.textures,plateau.render.textures);
    assert.equal(s.render.visibleMaterials,baseline.render.visibleMaterials);
    for(const key of ['entries','capacity','resources','disposed'])assert.equal(s.render.streamingResources.cache?.[key],plateau.render.streamingResources.cache?.[key]);
    for(const n of s.state.population)assert(n.distanceTravelled>=baseline.state.population.find(p=>p.id===n.id).distanceTravelled);
    // Full chronology has been exported into s; do not mistake the growing
    // opt-in capture ledger for gameplay retention in the page's endpoint heap.
    await page.evaluate(()=>window.__VOXARRIUM__.discardExportedTransitions());
    const rawHeap=await heap();await cdp.send('HeapProfiler.collectGarbage');const retainedHeap=await heap();
    endpoints.push({cycle,measurement,snapshot:s,rawHeap,retainedHeap});
    write(`cycle-${cycle}.json`,endpoints.at(-1));
  }
  const final=await snapshot();
  // Endpoint GC/readback is outside measured windows; retain CPU wall evidence for every cycle.
  const lifecycle=final.streaming.events.filter(e=>['load-complete','unload'].includes(e.type));
  report={measuredAt:new Date().toISOString(),revision,sourceStatus,browserVersion:browser.version(),backend:final.facts.backend,viewport:{width:1920,height:1080,dpr:1},environmentPreset:{weather,light},cycles,route,
    scope:'Three actual W+Shift circuits from the natural rural spawn; yaw steering every80ms; no bookmarks/teleports/stepping. Environment preset and audio settings remain authoritative. Forced endpoint GC is outside rAF sample windows, reported separately. Full rAF intervals and chronological request reports are retained; preparation/activation maxima and ready-before-boundary are associated by shared page clocks. rAF/browser CPU wall time and JS heap are not GPU time or VRAM.',
    cachePlateau:{comparison:'First complete rural return populates the finite immutable cache. Later equivalent returns must match it exactly; startup ownership and first-return growth are both retained.',
      startup:{geometries:baseline.render.geometries,textures:baseline.render.textures,visibleMaterials:baseline.render.visibleMaterials,ownership:baseline.render.streamingResources},
      firstReturn:{geometries:endpoints[0].snapshot.render.geometries,textures:endpoints[0].snapshot.render.textures,visibleMaterials:endpoints[0].snapshot.render.visibleMaterials,ownership:endpoints[0].snapshot.render.streamingResources}},
    durationMs:Date.now()-start,baseline,baselineRawHeap,baselineRetainedHeap,endpoints,arrivals,checkpoints,lifecycle,final,errors};
  assert.deepEqual(errors,[]);write('stress-report.json',report);
  await page.screenshot({path:resolve(directory,'rural-return.png')});
  console.log(JSON.stringify({directory,durationMs:report.durationMs,cycles,intervals:endpoints.map(e=>{
    const {longFrames,frames,transitions,...summary}=e.measurement;return {...summary,transitionSpecificMaximumMs:transitions.transitionSpecificMaximumMs,largestSchedulerJobMs:transitions.largestSchedulerJobMs,readyBeforeBoundary:transitions.readyBeforeBoundary,readyBeforeBoundaryNeeded:transitions.readyBeforeBoundaryNeeded};
  }),retainedHeaps:endpoints.map(e=>e.retainedHeap),counts:final.streaming.counts,errors}));
} catch(error) {
    write('failure.json',{error:String(error),errors,checkpoints,endpoints,arrivals,snapshot:await page.evaluate(()=>{
      const s=window.__VOXARRIUM__?.snapshot();if(s)s.measurementControls={focused:document.hasFocus(),visibility:document.visibilityState,
        pointerLocked:document.pointerLockElement?.id==='world',events:window.__stressControlEvents};return s;
    }).catch(()=>null)});
  throw error;
} finally {
  await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});
  await context.close();await browser.close();
}
