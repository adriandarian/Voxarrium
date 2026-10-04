import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { summarizeTransitions } from './streaming-transition-summary.mjs';
import { runtimeSourceSnapshot } from './runtime-source-snapshot.mjs';
import {installTransitionCapture} from './transition-capture.mjs';

// Bounded actual-input soak. No teleports, bookmarks, deterministic stepping or reloads.
const weather = process.env.VOXARRIUM_WEATHER ?? 'rain';
const light = process.env.VOXARRIUM_LIGHT ?? (weather === 'rain' ? 'dusk' : 'day');
if (!['clear', 'rain'].includes(weather) || !['day', 'dusk'].includes(light)) throw new Error('Streaming stress supports clear/rain and day/dusk presets.');
const directory = resolve(process.env.VOXARRIUM_STREAMING_DIR ?? `artifacts/m8/stress/${weather}-${light}`);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceStatus = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
const cycles = Number(process.env.VOXARRIUM_CORE_CYCLES ?? 3);
const heapSnapshots=process.env.VOXARRIUM_HEAP_SNAPSHOTS==='1';
const sourceSnapshot=runtimeSourceSnapshot();


mkdirSync(directory,{recursive:true});
const write = (name,value) => writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
write('runtime-source.json',sourceSnapshot);
const captureProtocol={version:2,liveReadbacks:'Mutable checks without static city/bookmark metadata or complete request records',
  chronology:'Exact completed rows in <=32 KiB /64-row chunks, with transfer overhead inside full rAF windows',
  files:Object.fromEntries(['tools/stress-core.mjs','tools/transition-capture.mjs'].map(path=>[path,
    createHash('sha256').update(readFileSync(resolve(path))).digest('hex')]))};
write('capture-protocol.json',captureProtocol);
// Headless native Chrome keeps actual input inside the test page without
// capturing the owner's physical desktop mouse. Verify the initialized device;
// software rendering must never silently become performance evidence.
const browser = await chromium.launch({channel:process.env.VOXARRIUM_BROWSER ?? 'chrome',headless:true});
const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page = await context.newPage();
const errors=[], checkpoints=[], endpoints=[], arrivals=[];
const audioContexts=new Set(),audioContextEvents=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let report;
try {
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  cdp.on('WebAudio.contextCreated',({context})=>{audioContexts.add(context.contextId);audioContextEvents.push({type:'created',id:context.contextId,contextType:context.contextType});});
  cdp.on('WebAudio.contextWillBeDestroyed',({contextId})=>{audioContexts.delete(contextId);audioContextEvents.push({type:'destroyed',id:contextId});});
  await cdp.send('WebAudio.enable');
  await page.addInitScript(installTransitionCapture);
  await page.addInitScript(()=>{
    const events=window.__stressControlEvents=[];
    const record=type=>{if(events.length<128)events.push({type,timeMs:performance.now(),focused:document.hasFocus(),
      visibility:document.visibilityState,pointerLocked:document.pointerLockElement?.id==='world'});};
    for(const type of ['focus','blur'])window.addEventListener(type,()=>record(type));
    for(const type of ['visibilitychange','pointerlockchange','pointerlockerror'])document.addEventListener(type,()=>record(type));
    document.addEventListener('keydown',event=>{if(event.code==='Escape')record('Escape');});
  });
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:90000});
  await page.locator('#living-settings').evaluate(el=>{el.open=true;});
  for(const [category,value] of Object.entries({master:.4,ambience:.55,footsteps:.65,locals:.45})) {
    await page.locator(`#volume-${category}`).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  }
  await page.locator('#start').click();
  const controlsState=()=>page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState,
    pointerLocked:document.pointerLockElement?.id==='world',notice:document.querySelector('#notice')?.textContent,
    paused:window.__VOXARRIUM__?.snapshot().state.paused}));
  write('startup-controls.json',await controlsState());
  try { await page.waitForFunction(()=>document.pointerLockElement?.id==='world'); }
  catch(error) { write('startup-controls-failure.json',await controlsState());await page.screenshot({path:resolve(directory,'startup-controls-failure.png')});throw error; }
  await page.evaluate(({weather,light})=>{const h=window.__VOXARRIUM__;h.environment(weather,light,true);h.freeze(false);},{weather,light});
  await page.waitForTimeout(3000);
  const exportedTransitions=new Map();
  const snapshot=async(chronology=true)=>{
    const s=await page.evaluate(chronology=>{
    const s=window.__VOXARRIUM__.snapshot();
    s.measurementControls={focused:document.hasFocus(),visibility:document.visibilityState,
      pointerLocked:document.pointerLockElement?.id==='world',events:window.__stressControlEvents};
    // Periodic state assertions need aggregates, not a multi-megabyte transfer
    // of every previous request row. Finished requests export once before
    // ledger eviction; the complete merged chronology exports at returns.
    if(!chronology){
      const seen=window.__stressExportedLifecycleIds??=new Set();
      // Export each ended, fully settled lifecycle before the fixed 48-entry
      // page ledger can evict it. Never drain it during measured traversal.
      const finished=s.tail.transitions.reports.filter(r=>r.endedAtMs!==null&&r.pendingSpans===0&&!seen.has(r.id));
      s.finishedTransitionHeaders=window.__transitionCapture.stage(finished);
      for(const r of finished)seen.add(r.id);
      if(seen.size>128)throw new Error('Per-circuit transition export exceeded its bounded capture set.');
      s.tail={maxIntervalMs:s.tail.maxIntervalMs,spans:s.tail.spans,dropped:s.tail.dropped,
      // Keep the largest recent gap before the bounded tail ring can roll it out.
      // Full rAF samples still provide the complete cadence series.
      recentPeakGap:s.tail.frameGaps.reduce((peak,gap)=>!peak||gap.intervalMs>peak.intervalMs?gap:peak,null)};
      // Static city/bookmark review metadata is already captured at startup.
      // Live checks need mutable ownership/state; large chronology payloads
      // transfer separately in 32 KiB chunks during ordinary moving samples.
      delete s.city;delete s.bookmarks;
    }
    return s;
    },chronology);
    for(const {recordCount,...header} of s.finishedTransitionHeaders??[]){
      assert(!exportedTransitions.has(header.id),'Completed report was exported twice.');
      exportedTransitions.set(header.id,{...header,records:[],captureRecordCount:recordCount,captureDone:false});
    }
    delete s.finishedTransitionHeaders;return s;
  };
  async function exportOneChunk(){
    const report=[...exportedTransitions.values()].find(r=>!r.captureDone);if(!report)return false;
    const chunk=await page.evaluate(id=>window.__transitionCapture.read(id),report.id);
    assert.equal(chunk.offset,report.records.length,'Chronology chunk sequence changed.');
    report.records.push(...chunk.records);report.captureDone=chunk.done;
    if(chunk.done)assert.equal(report.records.length,report.captureRecordCount,'Chronology export omitted records.');
    return true;
  }
  const heap=async()=>{
    const {metrics}=await cdp.send('Performance.getMetrics');
    const values=Object.fromEntries(metrics.map(m=>[m.name,m.value]));
    return {used:values.JSHeapUsedSize,total:values.JSHeapTotalSize,source:'Chrome CDP Performance metrics; JavaScript heap, not VRAM'};
  };
  async function captureHeap(name){
    if(!heapSnapshots)return null;
    const file=`${name}.heapsnapshot`,path=resolve(directory,file),started=Date.now();let bytes=0;
    writeFileSync(path,'');
    const onChunk=({chunk})=>{appendFileSync(path,chunk);bytes+=Buffer.byteLength(chunk);};
    await cdp.send('HeapProfiler.enable');cdp.on('HeapProfiler.addHeapSnapshotChunk',onChunk);
    try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});}
    finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',onChunk);await cdp.send('HeapProfiler.disable');}
    return {file,bytes,wallMs:Date.now()-started,scope:'Local V8 heap graph captured at stationary endpoint outside cadence sampling; profiler disabled before traversal resumes.'};
  }
  const baseline=await snapshot();
  assert.equal(baseline.facts.backend,'WebGPU');
  assert.equal(baseline.facts.adapterInfoSource,'initialized GPUDevice.adapterInfo');
  assert.equal(baseline.facts.adapter.vendor,'amd');
  assert.equal(baseline.facts.adapter.architecture,'rdna-2');
  write('initialized-backend.json',{headless:true,browser:browser.version(),facts:baseline.facts,
    scope:'Hardware-backed headless Chrome; no physical desktop mouse capture. Owner continues using the machine; external CPU/GPU workloads are uncontrolled.'});
  // GC is diagnostic at stationary endpoints, outside interval sampling. Both raw/retained heaps are reported.
  const baselineRawHeap=await heap();
  await cdp.send('HeapProfiler.collectGarbage');
  const baselineRetainedHeap=await heap();
  const baselineHeapSnapshot=await captureHeap('startup');
  const ids=baseline.state.population.map(n=>n.id);
  const routeState=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  const route=routeState.city.route.slice(1).map(p=>[p.x,p.z]);
  assert.equal(routeState.city.coreIds.length,7);
  write('route.json',{scope:'Natural spawn, all seven connected core wards and new local circuits, Canal north quay, return to rural; actual W/Shift input only.',route,coreIds:routeState.city.coreIds,cycles});
  let previousElapsed=baseline.state.elapsed,previousEnvironmentTime=baseline.state.environment.time;
  function validate(s) {
    assert.equal(s.state.resets,0); assert.equal(s.state.paused,false);
    assert.equal(s.measurementControls.focused,true);assert.equal(s.measurementControls.visibility,'visible');
    assert.equal(s.measurementControls.pointerLocked,true);
    assert(s.state.player.position.y>.55);assert.equal(s.state.player.grounded,true);
    assert.deepEqual(s.state.population.map(n=>n.id),ids); assert.equal(s.npcTiers.uniqueIds,ids.length);
    assert.deepEqual(s.streaming.errors,[]);assert.equal(s.state.environment.weather,weather);
    assert.equal(s.state.environment.timeOfDay,light);assert.deepEqual(s.settings.audio,baseline.settings.audio);
    assert.equal(s.audio.activeLoops,5);assert(s.audio.activeVoices<=5);
    assert.equal(audioContexts.size,1,'Native WebAudio context ownership changed during traversal.');
    assert.equal(audioContextEvents.filter(e=>e.type==='created').length,1,'A duplicate or replacement native audio context was created.');
    assert(s.state.elapsed>=previousElapsed,'Simulation time reset.');assert(s.state.environment.time>=previousEnvironmentTime,'Environment time reset.');
    previousElapsed=s.state.elapsed;previousEnvironmentTime=s.state.environment.time;
    assert(s.streaming.loadedIds.length<=2,'Loaded-area policy exceeded two areas.');
    assert(s.streaming.loadedIds.length+s.streaming.pendingIds.length+s.streaming.retiringIds.length<=2,'Live detail instances/transports exceeded two leases.');
    const cache=s.render.streamingResources.cache;
    if(cache){assert(cache.entries<=cache.capacity);assert.equal(cache.disposed,false);}
    assert.equal((s.render.textureEvents??[]).filter(event=>event.event==='recreated').length,0,'Disposed GPU texture was recreated.');
    for(const id of baseline.city.districts.map(d=>d.id)) assert.equal(!!s.physics.areas[id],s.streaming.activeIds.includes(id));
  }
  async function beginSample() {
    exportedTransitions.clear();
    await page.evaluate(()=>{
      if(window.__transitionCapture.status().pendingReports!==0)throw new Error('A previous circuit left an unfinished export.');
      window.__stressExportedLifecycleIds=new Set();
      window.__VOXARRIUM__.resetTail();
      const m=window.__streamingMeasure={frames:[],capacity:150000,dropped:0,start:performance.now(),last:null,active:true};
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
    const cycleStartLoads=(await snapshot()).streaming.counts.loads;
    await page.evaluate(cycle=>window.__VOXARRIUM__.mode(cycle%2===1?'first-person':'third-person'),cycle);
    await beginSample();
    for(const [index,target] of route.entries()) {
      const legStart=Date.now();
      let running=true;
      await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
      for(;;) {
        assert(Date.now()-start<2700000,'Bounded core stress exceeded45minutes');
        assert(Date.now()-legStart<60000,`Navigation stalled cycle ${cycle}, waypoint ${index}`);
        const result=await page.evaluate(([x,z])=>{
          const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);
          return {distance:Math.hypot(p.x-x,p.z-z),p};
        },target);
        if(result.distance<.55)break;
        if(running&&result.distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}
        if(Date.now()-start>=nextCheckpoint) {
          const s=await snapshot(false);validate(s);
          const {tail,...state}=s;
          checkpoints.push({elapsedMs:Date.now()-start,cycle,waypoint:index,...state,tailSummary:{maxIntervalMs:tail.maxIntervalMs,spans:tail.spans,dropped:tail.dropped,recentPeakGap:tail.recentPeakGap},heap:await heap()});
          nextCheckpoint+=10000;
          console.log(JSON.stringify({elapsedMs:Date.now()-start,cycle,waypoint:index,position:s.state.player.position,loaded:s.streaming.loadedIds}));
        }
        await exportOneChunk();
        await page.waitForTimeout(80);
      }
      await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
      if(target[0]===206 || index===route.length-1) await page.waitForTimeout(2200);
      const s=await snapshot(false);validate(s);
      arrivals.push({cycle,waypoint:index,elapsedMs:Date.now()-start,position:s.state.player.position,environmentTime:s.state.environment.time,loaded:s.streaming.loadedIds,active:s.streaming.activeIds,npcTiers:s.npcTiers,counts:s.streaming.counts});
    }
    // All waypoint reports export incrementally while W is held. Only a
    // remaining settled endpoint tail drains here; no added junction idle or
    // readiness lead. Every chunk remains inside the full rAF sample window.
    while(await exportOneChunk()){}
    const measurement=await endSample();
    // Compare equivalent stationary third-person endpoint ownership, including
    // the same visible avatar material. The traversed first-person cycle remains measured.
    await page.evaluate(()=>window.__VOXARRIUM__.mode('third-person'));
    await page.waitForTimeout(200);
    const s=await snapshot();validate(s);assert.equal(measurement.dropped,0);
    assert(s.tail.transitions?.enabled,'Transition diagnostics are required for M8 stress.');
    const merged=new Map([...exportedTransitions,...s.tail.transitions.reports.map(r=>[r.id,r])]);
    s.tail.transitions={...s.tail.transitions,reports:[...merged.values()],
      exportMethod:'Settled ended reports staged once at existing waypoint/checkpoint readbacks; exact rows transfer in <=32 KiB /64-row chunks during ordinary moving steer loops, with any residual rural endpoint tail drained before sampling ends. Static city/bookmark metadata stays in startup/endpoint captures. No chronology rows or rAF intervals omitted. Live ledger/export queue each capped at48. Export overhead remains sampled.'};
    measurement.transitions = summarizeTransitions(s.tail.transitions,measurement.frames,measurement.startMs,measurement.endMs);
    const requestedDuringSample=measurement.transitions.reports.filter(r=>r.requestAtMs>=measurement.startMs&&r.requestAtMs<=measurement.endMs).length;
    assert.equal(requestedDuringSample,s.streaming.counts.loads-cycleStartLoads,'A request lifecycle was lost before complete circuit export.');
    assert(measurement.transitions.reports.every(r=>r.completeChronology&&r.droppedRecords===0),'A per-request chronology was incomplete.');
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
    for(const key of ['entries','capacity','resources','references','instanceReferences','disposed'])assert.equal(s.render.streamingResources.cache?.[key],plateau.render.streamingResources.cache?.[key]);
    const pipelines=s.render.streamingResources.gpuPipelines,previousPipelines=plateau.render.streamingResources.gpuPipelines;
    if(pipelines){
      assert(pipelines.entries<=pipelines.capacity);assert.equal(pipelines.pending,0);assert.equal(pipelines.disposed,false);
      for(const key of ['entries','capacity','programs','references'])assert.equal(pipelines[key],previousPipelines[key]);
      assert.deepEqual(pipelines.byArea,previousPipelines.byArea);
    }
    assert.deepEqual(s.render.streamingResources.cache?.byType,plateau.render.streamingResources.cache?.byType);
    for(const n of s.state.population)assert(n.distanceTravelled>=baseline.state.population.find(p=>p.id===n.id).distanceTravelled);
    // Full chronology has been exported into s; do not mistake the growing
    // opt-in capture ledger for gameplay retention in the page's endpoint heap.
    const instrumentedRawHeap=await heap();
    await page.evaluate(()=>{
      const h=window.__VOXARRIUM__;h.discardExportedTransitions();h.resetTail();
      // Evidence has been exported into Node. Release capture-only objects,
      // retaining ordinary world/render state and the live rural lifecycle.
      window.__streamingMeasure.frames.length=0;window.__streamingMeasure=null;
      window.__stressExportedLifecycleIds=null;window.__transitionCapture.clear();
    });
    // Let inactive renderer lists age past ten frames before endpoint GC.
    await page.waitForTimeout(200);
    const rawHeap=await heap();await cdp.send('HeapProfiler.collectGarbage');const retainedHeap=await heap();
    const heapSnapshot=await captureHeap(`cycle-${cycle}`);
    endpoints.push({cycle,measurement,snapshot:s,instrumentedRawHeap,rawHeap,retainedHeap,heapSnapshot,
      heapMethod:'Export full evidence, drain ended transitions/reset general tail rings, clear capture frame buffers, allow 200 ms of ordinary rendered frames, then sample raw/forced-GC JS heap. The active rural lifecycle remains.'});
    write(`cycle-${cycle}.json`,endpoints.at(-1));
    assert(measurement.max<200,`Cycle ${cycle} exceeded the 200 ms full-traversal frame bound.`);
    assert(measurement.transitions.transitionSpecificMaximumMs<200,`Cycle ${cycle} exceeded the 200 ms transition bound.`);
    assert.equal(measurement.transitions.readyBeforeBoundaryNeeded.late,0,`Cycle ${cycle} reached a safety approach before preparation was ready.`);
    assert.equal(measurement.transitions.readyBeforeBoundary.late,0,`Cycle ${cycle} crossed an unready destination.`);
    assert(baseline.city.coreIds.every(id=>arrivals.some(a=>a.cycle===cycle&&a.active.includes(id))),`Cycle ${cycle} did not activate every core ward.`);
  }
  const final=await snapshot();
  // Endpoint GC/readback is outside measured windows; retain CPU wall evidence for every cycle.
  const lifecycle=final.streaming.events.filter(e=>['load-complete','unload'].includes(e.type));
  assert.equal(runtimeSourceSnapshot().sha256,sourceSnapshot.sha256,'Runtime source changed during measured traversal.');
  report={measuredAt:new Date().toISOString(),revision,sourceStatus,runtimeSourceSha256:sourceSnapshot.sha256,browserVersion:browser.version(),backend:final.facts.backend,viewport:{width:1920,height:1080,dpr:1},environmentPreset:{weather,light},cycles,route,
    execution:{headless:true,physicalMouseCapture:false,externalWorkloads:'Owner continues using the machine; external CPU/GPU workloads are uncontrolled.',adapter:final.facts.adapter},captureProtocol,
    scope:'Three actual W+Shift circuits in hardware-backed headless Chrome from the natural rural spawn; yaw steering every80ms; no bookmarks/teleports/stepping. No physical desktop mouse capture. Environment preset and audio settings remain authoritative. Export/diagnostic-buffer cleanup, 200 ms render-list aging and forced endpoint GC are outside rAF sample windows and reported separately. Full rAF intervals and chronological request reports are retained; preparation/activation maxima and ready-before-boundary are associated by shared page clocks. rAF/browser CPU wall time and JS heap are not GPU time, VRAM or physical display presentation. Owner external workloads are uncontrolled; these timings are not matched to earlier headed measurements.',
    cachePlateau:{comparison:'First complete rural return populates the finite immutable cache. Later equivalent returns must match it exactly; startup ownership and first-return growth are both retained.',
      startup:{geometries:baseline.render.geometries,textures:baseline.render.textures,visibleMaterials:baseline.render.visibleMaterials,ownership:baseline.render.streamingResources},
      firstReturn:{geometries:endpoints[0].snapshot.render.geometries,textures:endpoints[0].snapshot.render.textures,visibleMaterials:endpoints[0].snapshot.render.visibleMaterials,ownership:endpoints[0].snapshot.render.streamingResources}},
    acceptance:{fullTraversalTailWithinM8Limit:endpoints.every(e=>e.measurement.max<200),
      transitionTailWithinM8Limit:endpoints.every(e=>e.measurement.transitions.transitionSpecificMaximumMs<200),
      readyBeforeNeeded:endpoints.every(e=>e.measurement.transitions.readyBeforeBoundaryNeeded.late===0),
      readyBeforeCrossing:endpoints.every(e=>e.measurement.transitions.readyBeforeBoundary.late===0),
      allCoreWardsVisited:endpoints.every(e=>baseline.city.coreIds.every(id=>arrivals.some(a=>a.cycle===e.cycle&&a.active.includes(id)))),
      thresholdMs:200,source:'M8 objective prohibits multi-hundred-millisecond transition freezes; 200 ms is the lower bound enforced by this driver.'},
    heapSnapshots,baselineHeapSnapshot,nativeAudioContexts:{active:[...audioContexts],events:audioContextEvents,scope:'Chrome CDP WebAudio context lifecycle enabled before navigation; creation/destruction events, not a sound-quality measurement.'},durationMs:Date.now()-start,baseline,baselineRawHeap,baselineRetainedHeap,endpoints,arrivals,checkpoints,lifecycle,final,errors};
  assert.deepEqual(errors,[]);write('stress-report.json',report);
  await page.screenshot({path:resolve(directory,'rural-return.png')});
  console.log(JSON.stringify({directory,durationMs:report.durationMs,cycles,intervals:endpoints.map(e=>{
    const {longFrames,frames,transitions,...summary}=e.measurement;return {...summary,transitionSpecificMaximumMs:transitions.transitionSpecificMaximumMs,largestSchedulerJobMs:transitions.largestSchedulerJobMs,readyBeforeBoundary:transitions.readyBeforeBoundary,readyBeforeBoundaryNeeded:transitions.readyBeforeBoundaryNeeded};
  }),retainedHeaps:endpoints.map(e=>e.retainedHeap),counts:final.streaming.counts,errors}));
  assert(report.acceptance.fullTraversalTailWithinM8Limit,'M8 rejects a full-traversal interval of 200 ms or more; complete evidence has been retained.');
  assert(report.acceptance.transitionTailWithinM8Limit,'M8 rejects a transition-window interval of 200 ms or more; complete evidence has been retained.');
  assert(report.acceptance.readyBeforeNeeded,'A destination was not ready at the safety approach; chronology is retained.');
  assert(report.acceptance.readyBeforeCrossing,'A destination was not ready before its exact crossing.');
  assert(report.acceptance.allCoreWardsVisited,'The actual-input circuit did not activate every core ward.');
} catch(error) {
    write('failure.json',{error:String(error),errors,checkpoints,endpoints,arrivals,nativeAudioContexts:{active:[...audioContexts],events:audioContextEvents},snapshot:await page.evaluate(()=>{
      const s=window.__VOXARRIUM__?.snapshot();if(s)s.measurementControls={focused:document.hasFocus(),visibility:document.visibilityState,
        pointerLocked:document.pointerLockElement?.id==='world',events:window.__stressControlEvents};return s;
    }).catch(()=>null)});
  throw error;
} finally {
  await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});
  await context.close();await browser.close();
}
