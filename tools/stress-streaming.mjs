import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Bounded actual-input soak. No teleports, bookmarks, deterministic stepping or reloads.
const directory = resolve(process.env.VOXARRIUM_STREAMING_DIR ?? 'artifacts/m5/stress');
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
  await page.goto('http://127.0.0.1:5173/?test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:90000});
  await page.locator('#living-settings').evaluate(el=>{el.open=true;});
  for(const [category,value] of Object.entries({master:.4,ambience:.55,footsteps:.65,locals:.45})) {
    await page.locator(`#volume-${category}`).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  }
  await page.locator('#start').click();
  await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.environment('rain','dusk',true);h.freeze(false);});
  await page.waitForTimeout(3000);
  const snapshot=()=>page.evaluate(()=>window.__VOXARRIUM__.snapshot());
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
    assert(s.state.player.position.y>3.97);assert.equal(s.state.player.grounded,true);
    assert.deepEqual(s.state.population.map(n=>n.id),ids); assert.equal(s.npcTiers.uniqueIds,42);
    assert.deepEqual(s.streaming.errors,[]);assert.equal(s.state.environment.weather,'rain');
    assert.equal(s.state.environment.timeOfDay,'dusk');assert.deepEqual(s.settings.audio,baseline.settings.audio);
    assert.equal(s.audio.activeLoops,5);assert(s.audio.activeVoices<=5);
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
      return {startMs:m.start,endMs:performance.now(),samples:sorted.length,p50:p(.5),p95:p(.95),p99:p(.99),max:sorted.at(-1),over33:sorted.filter(n=>n>33.3).length,dropped:m.dropped,longFrames:m.frames.filter(f=>f.interval>33.3)};
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
          const s=await snapshot();validate(s);
          const {tail,...state}=s;
          checkpoints.push({elapsedMs:Date.now()-start,cycle,waypoint:index,...state,tailSummary:{maxIntervalMs:tail.maxIntervalMs,spans:tail.spans,dropped:tail.dropped},heap:await heap()});
          nextCheckpoint+=10000;
          console.log(JSON.stringify({elapsedMs:Date.now()-start,cycle,waypoint:index,position:s.state.player.position,loaded:s.streaming.loadedIds}));
        }
        await page.waitForTimeout(80);
      }
      await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
      if(target[0]===206 || index===route.length-1) await page.waitForTimeout(2200);
      const s=await snapshot();validate(s);
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
    assert.deepEqual(s.streaming.loadedIds,['rural']);
    assert.deepEqual(s.render.streamingResources.render,baseline.render.streamingResources.render);
    assert.deepEqual(s.render.streamingResources.assets,baseline.render.streamingResources.assets);
    assert.deepEqual(s.physics,baseline.physics);
    assert.equal(s.render.geometries,baseline.render.geometries);assert.equal(s.render.textures,baseline.render.textures);
    assert.equal(s.render.visibleMaterials,baseline.render.visibleMaterials);
    for(const n of s.state.population)assert(n.distanceTravelled>=baseline.state.population.find(p=>p.id===n.id).distanceTravelled);
    const rawHeap=await heap();await cdp.send('HeapProfiler.collectGarbage');const retainedHeap=await heap();
    endpoints.push({cycle,measurement,snapshot:s,rawHeap,retainedHeap});
    write(`cycle-${cycle}.json`,endpoints.at(-1));
  }
  const final=await snapshot();
  // Endpoint GC/readback is outside measured windows; retain CPU wall evidence for every cycle.
  const lifecycle=final.streaming.events.filter(e=>['load-complete','unload'].includes(e.type));
  report={measuredAt:new Date().toISOString(),browserVersion:browser.version(),backend:final.facts.backend,viewport:{width:1920,height:1080,dpr:1},cycles,route,
    scope:'Three actual W+Shift circuits from the natural rural spawn; yaw steering every80ms; no bookmarks/teleports/stepping. Rain/dusk and audio settings remain authoritative. Forced endpoint GC is outside rAF sample windows, reported separately. rAF/browser CPU wall time and JS heap are not GPU time or VRAM.',
    durationMs:Date.now()-start,baseline,baselineRawHeap,baselineRetainedHeap,endpoints,arrivals,checkpoints,lifecycle,final,errors};
  assert.deepEqual(errors,[]);write('stress-report.json',report);
  await page.screenshot({path:resolve(directory,'rural-return.png')});
  console.log(JSON.stringify({directory,durationMs:report.durationMs,cycles,intervals:endpoints.map(e=>{
    const {longFrames,...summary}=e.measurement;return summary;
  }),retainedHeaps:endpoints.map(e=>e.retainedHeap),counts:final.streaming.counts,errors}));
} catch(error) {
  write('failure.json',{error:String(error),errors,checkpoints,endpoints,arrivals,snapshot:await page.evaluate(()=>window.__VOXARRIUM__?.snapshot()).catch(()=>null)});
  throw error;
} finally {
  await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});
  await context.close();await browser.close();
}
