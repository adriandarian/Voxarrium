import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runtimeSourceSnapshot } from './runtime-source-snapshot.mjs';
import { summarizeTransitions } from './streaming-transition-summary.mjs';

// Natural parked Rural -> River -> Forecourt -> Rural twice; real input only.
const directory=resolve(process.env.VOXARRIUM_RIVER_PROBE_DIR??'artifacts/m8/probes/scheduled-river-reload');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[],cycles=[];
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const browser=await chromium.launch({channel:'chrome',headless:true});
let page;
try{
  page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(()=>window.__VOXARRIUM__.environment('clear','day',true));
  const initial=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());write('initial-startup.json',initial);
  // Startup deliberately retains its one known ready neighbor until ordinary
  // movement releases the hint. A small real-input Rural walk releases it;
  // return and retire River fully before either measured reload departure.
  const setupStarted=Date.now();
  for(const target of [[5,-1],[initial.state.player.position.x,initial.state.player.position.z]]){
    await page.keyboard.down('KeyW');
    for(;;){
      assert(Date.now()-setupStarted<30000,'Startup Rural walk stalled.');
      const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(distance<.55)break;await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');
  }
  // Let the ordinary startup hint finish and retire. No readiness lead is
  // supplied before either measured departure; River must start fully absent.
  await page.waitForFunction(()=>{const s=window.__VOXARRIUM__.snapshot();return s.streaming.counts.loads>=2&&
    s.streaming.loadedIds.length===1&&s.streaming.loadedIds[0]==='rural'&&
    s.streaming.pendingIds.length===0&&s.streaming.retiringIds.length===0;},undefined,{timeout:120000,polling:1000});
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(baseline.facts.backend,'WebGPU');assert.equal(baseline.facts.adapter.vendor,'amd');
  assert.equal(baseline.facts.adapter.architecture,'rdna-2');
  // Cover the original supported forecourt exit as well as the short River
  // approach. Earlier six-point short-turn evidence remains preserved.
  const outward=baseline.city.route.slice(1,10).map(p=>[p.x,p.z]);
  const spawn=[baseline.state.player.position.x,baseline.state.player.position.z];
  const route=[...outward,...outward.slice(0,-1).reverse(),spawn];
  write('runtime-source.json',source);write('startup.json',baseline);
  for(let cycle=0;cycle<2;cycle++){
    const before=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
    assert.deepEqual(before.streaming.loadedIds,['rural']);assert.deepEqual(before.streaming.pendingIds,[]);assert.deepEqual(before.streaming.retiringIds,[]);
    await page.evaluate(cycle=>{const h=window.__VOXARRIUM__;h.mode(cycle===0?'third-person':'first-person');h.resetTail();
      const m=window.__riverMeasure={startMs:performance.now(),frames:[],last:null,active:true,dropped:0};
      const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<20000)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}
        m.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);},cycle);
    const started=Date.now(),arrivals=[];
    for(const target of route){
      let running=true;await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
      for(;;){
        assert(Date.now()-started<180000,'Bounded Rural/River circuit stalled.');
        const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
        if(distance<.55)break;if(running&&distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}
        await page.waitForTimeout(80);
      }
      await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
      const s=await page.evaluate(()=>{const s=window.__VOXARRIUM__.snapshot();return {player:s.state.player,resets:s.state.resets,paused:s.state.paused,streaming:s.streaming};});
      assert.equal(s.resets,0);assert.equal(s.paused,false);assert.equal(s.player.grounded,true);assert.deepEqual(s.streaming.errors,[]);
      assert(s.streaming.loadedIds.length+s.streaming.pendingIds.length+s.streaming.retiringIds.length<=2);
      arrivals.push({target,...s});
    }
    await page.waitForTimeout(2300);
    const measured=await page.evaluate(()=>{const m=window.__riverMeasure;m.active=false;return {...m,endMs:performance.now(),snapshot:window.__VOXARRIUM__.snapshot()};});
    const transitions=summarizeTransitions(measured.snapshot.tail.transitions,measured.frames,measured.startMs,measured.endMs);
    const river=transitions.reports.filter(r=>r.areaId==='river-market'&&r.requestAtMs>=measured.startMs);
    const sorted=measured.frames.map(f=>f.interval).sort((a,b)=>a-b),percentile=p=>sorted[Math.ceil(sorted.length*p)-1];
    const summary={cycle,durationMs:Date.now()-started,samples:sorted.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sorted.at(-1),
      riverRequests:river.length,requestToReadyMs:river[0]?.requestToReadyMs,readyLeadBeforeNeededMs:river[0]?.readyLeadBeforeBoundaryNeededMs,
      largestSchedulerJobMs:transitions.largestSchedulerJobMs,needed:transitions.readyBeforeBoundaryNeeded,cross:transitions.readyBeforeBoundary};
    cycles.push({summary,arrivals,...measured,transitions});write(`cycle-${cycle}.json`,cycles.at(-1));console.log(JSON.stringify(summary));
    assert.equal(measured.dropped,0);assert.deepEqual(errors,[]);assert.deepEqual(measured.snapshot.streaming.loadedIds,['rural']);
    assert(river.length>=1);assert(river.every(r=>r.readyBeforeBoundaryNeeded!==false&&r.readyBeforeBoundary!==false));
    assert.equal(river[0].readyBeforeBoundaryNeeded,true);assert.equal(river[0].readyBeforeBoundary,true);
    assert.equal(transitions.readyBeforeBoundaryNeeded.late,0);assert.equal(transitions.readyBeforeBoundary.late,0);
    assert(summary.max<200);assert.equal(measured.snapshot.npcTiers.uniqueIds,152);assert.equal(measured.snapshot.audio.activeLoops,5);
  }
  assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  write('probe.json',{sourceSha256:source.sha256,browser:browser.version(),headless:true,physicalMouseCapture:false,route,cycles,errors,
    scope:'Natural Rural spawn, short actual-input Rural walk releases the ordinary startup hint, then River fully retires before two measured real W/Shift departures through the first nine authored route points (River approach and Forecourt exit) and reverse return (third/first-person). No bookmark, teleport, fixed step, reload or advance readiness supplied. Every sampled rAF interval retained, compact arrival responses, complete endpoint histories outside samples. External workloads uncontrolled; focused neighbor reload readiness/cadence, not whole-core repeated acceptance or GPU time.'});
}catch(error){write('failure.json',{error:String(error),errors,cycles,snapshot:await page?.evaluate(()=>window.__VOXARRIUM__?.snapshot()).catch(()=>null)});throw error;}
finally{await browser.close();}
