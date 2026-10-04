import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';
import {summarizeTransitions} from './streaming-transition-summary.mjs';

// Explicit prepared Central setup; measured original bridge/quay/return path
// uses only actual W/Shift input. This is focused, not natural-spawn acceptance.
const directory=resolve(process.env.VOXARRIUM_CANAL_PROBE_DIR??'artifacts/m8/probes/canal-instance-buffer-names');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[],arrivals=[];
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const browser=await chromium.launch({channel:'chrome',headless:true});
let page;
try{
  page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.freeze(true);h.environment('rain','dusk',true);
    h.bookmark('city.central-market','third-person');h.step(180);await h.settleStreaming();});
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(baseline.facts.backend,'WebGPU');assert.equal(baseline.facts.adapter.vendor,'amd');assert.equal(baseline.facts.adapter.architecture,'rdna-2');
  assert.equal(baseline.state.resets,0);assert(baseline.streaming.activeIds.includes('central-market'));
  assert(![...baseline.streaming.loadedIds,...baseline.streaming.pendingIds,...baseline.streaming.retiringIds].includes('lower-canal'),'Canal must start absent.');
  const all=baseline.city.route,start=all.findIndex((p,i)=>p.x===110&&p.z===-235&&all[i+1]?.x===175);
  const end=all.findIndex((p,i)=>i>start&&p.x===110&&p.z===-235);
  assert(start>=0&&end>start);const route=all.slice(start+1,end+1).map(p=>[p.x,p.z]);
  write('runtime-source.json',source);write('startup.json',baseline);
  await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.resetTail();h.freeze(false);
    const m=window.__canalProbe={frames:[],dropped:0,startMs:performance.now(),last:null,active:true};
    const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<50000)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}
      m.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  const began=Date.now();
  for(const target of route){
    let running=true;await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
    for(;;){assert(Date.now()-began<300000,'Bounded Canal probe stalled.');
      const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(distance<.55)break;if(running&&distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    const s=await page.evaluate(()=>{const s=window.__VOXARRIUM__.snapshot();return {timeMs:performance.now(),player:s.state.player,resets:s.state.resets,paused:s.state.paused,streaming:s.streaming};});
    assert.equal(s.resets,0);assert.equal(s.paused,false);assert.equal(s.player.grounded,true);assert.deepEqual(s.streaming.errors,[]);
    assert(s.streaming.loadedIds.length+s.streaming.pendingIds.length+s.streaming.retiringIds.length<=2);arrivals.push({target,...s});
  }
  await page.waitForTimeout(2300);
  const measured=await page.evaluate(()=>{const m=window.__canalProbe;m.active=false;return {...m,endMs:performance.now(),snapshot:window.__VOXARRIUM__.snapshot()};});
  const ledger=measured.snapshot.tail.transitions;
  // The prepared bookmark is explicit setup. Preserve its complete chronology,
  // but readiness gates apply to requests/boundaries observed in this sample.
  const inSample=r=>r.startedAtMs>=measured.startMs||r.boundaryNeededAtMs>=measured.startMs||r.boundaryAtMs>=measured.startMs;
  const excludedSetupReports=ledger.reports.filter(r=>!inSample(r)).map(r=>({id:r.id,startedAtMs:r.startedAtMs,
    boundaryNeededAtMs:r.boundaryNeededAtMs,boundaryAtMs:r.boundaryAtMs,reason:'Request and both boundary observations precede actual-input sampling.'}));
  const transitions=summarizeTransitions({...ledger,reports:ledger.reports.filter(inSample)},measured.frames,measured.startMs,measured.endMs);
  const canal=transitions.reports.filter(r=>r.areaId==='lower-canal'&&r.requestAtMs>=measured.startMs);
  const sorted=measured.frames.map(f=>f.interval).sort((a,b)=>a-b),percentile=p=>sorted[Math.ceil(sorted.length*p)-1];
  const summary={durationMs:Date.now()-began,samples:sorted.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sorted.at(-1),
    needed:transitions.readyBeforeBoundaryNeeded,cross:transitions.readyBeforeBoundary,largestJobMs:transitions.largestSchedulerJobMs,
    canal:canal.map(r=>({id:r.id,durationMs:r.requestToReadyMs,neededLeadMs:r.readyLeadBeforeBoundaryNeededMs,crossLeadMs:r.readyLeadBeforeBoundaryMs}))};
  write('probe.json',{sourceSha256:source.sha256,browser:browser.version(),headless:true,summary,route,arrivals,...measured,transitions,excludedSetupReports,errors,
    scope:'Rain/dusk, explicit prepared Central setup excludes natural-spawn acceptance. Canal begins absent; original core exchange bridge/quay/return segment uses actual W/Shift input, no in-sample bookmark/teleport/step/reload. Every rAF interval and endpoint chronology retained; compact arrival responses. External owner load uncontrolled; focused regression, not six-circuit/heap/GPU-time proof.'});
  console.log(JSON.stringify(summary));assert.equal(measured.dropped,0);assert.deepEqual(errors,[]);assert(summary.max<200);
  assert(canal.length>=1);assert(canal.some(r=>r.readyBeforeBoundaryNeeded===true));assert.equal(summary.needed.late,0);assert.equal(summary.cross.late,0);
  assert.equal(measured.snapshot.npcTiers.uniqueIds,152);assert.equal(measured.snapshot.audio.activeLoops,5);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
}catch(error){write('failure.json',{error:String(error),errors,arrivals,snapshot:await page?.evaluate(()=>window.__VOXARRIUM__?.snapshot()).catch(()=>null)});throw error;}
finally{await browser.close();}
