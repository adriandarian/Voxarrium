import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';
import {summarizeTransitions} from './streaming-transition-summary.mjs';

// Focused Civic detour/return regression; explicit setup excludes full-route acceptance.
const directory=resolve(process.env.VOXARRIUM_CIVIC_PROBE_DIR??'artifacts/m8/probes/civic-proxy-approach-candidate');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[],arrivals=[];
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.freeze(true);h.bookmark('m8.civic-terrace.street','third-person');
    h.environment('clear','day',true);h.step(180);await h.settleStreaming();});
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(baseline.facts.backend,'WebGPU');assert.equal(baseline.facts.adapter.vendor,'amd');
  assert.equal(baseline.facts.adapter.architecture,'rdna-2');assert.equal(baseline.state.resets,0);
  assert.deepEqual(baseline.streaming.errors,[]);assert(baseline.streaming.activeIds.includes('civic-terrace'));
  assert(!baseline.streaming.loadedIds.includes('central-market'),'Central must not be warm at probe setup.');
  const all=baseline.city.route,start=all.findIndex(p=>p.x===85&&p.z===-345),end=all.findIndex((p,i)=>i>start&&p.x===110&&p.z===-235);
  assert(start>=0&&end>start);const route=all.slice(start,end+1).map(p=>[p.x,p.z]);
  write('runtime-source.json',source);write('startup.json',baseline);
  await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.resetTail();h.freeze(false);
    const m=window.__civicProbe={frames:[],capacity:30000,dropped:0,start:performance.now(),last:null,active:true};
    const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<m.capacity)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}
      m.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  const started=Date.now();
  for(const target of route){
    let running=true;await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    for(;;){
      assert(Date.now()-started<240000,'Focused Civic detour exceeded four-minute bound.');
      const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();
        h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(distance<.55)break;if(running&&distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    const s=await page.evaluate(()=>{const s=window.__VOXARRIUM__.snapshot();return {
      state:{resets:s.state.resets,paused:s.state.paused,player:s.state.player},streaming:s.streaming,
      tail:{capturedAtMs:s.tail.capturedAtMs}};});
    assert.equal(s.state.resets,0);assert.equal(s.state.paused,false);assert.equal(s.state.player.grounded,true);
    assert.deepEqual(s.streaming.errors,[]);assert(s.streaming.loadedIds.length+s.streaming.pendingIds.length+s.streaming.retiringIds.length<=2);
    arrivals.push({target,pageTimeMs:s.tail.capturedAtMs,position:s.state.player.position,loaded:s.streaming.loadedIds,pending:s.streaming.pendingIds,retiring:s.streaming.retiringIds,counts:s.streaming.counts});
  }
  const measured=await page.evaluate(()=>{const m=window.__civicProbe;m.active=false;
    return {startMs:m.start,endMs:performance.now(),frames:m.frames,dropped:m.dropped,final:window.__VOXARRIUM__.snapshot()};});
  const transitions=summarizeTransitions(measured.final.tail.transitions,measured.frames,measured.startMs,measured.endMs);
  const central=transitions.reports.filter(r=>r.areaId==='central-market'&&r.requestAtMs>=measured.startMs);
  const report={sourceSha256:source.sha256,browser:browser.version(),headless:true,physicalMouseCapture:false,
    scope:'Explicit supported Civic street inspection setup and staged settlement; then real W/Shift with 80 ms yaw steering through the authored Civic circuit and descent to Central. Cold Central starts after sampling. Compact per-arrival mutable-state readbacks; full startup/final chronology outside sampling. Every sampled rAF interval retained. External workloads uncontrolled. Focused demand/readiness regression, not natural-spawn repeated core acceptance, GPU execution or a causal comparison with the earlier full circuit.',
    baseline,route,arrivals,...measured,transitions,errors,durationMs:Date.now()-started};
  write('probe.json',report);
  assert.equal(runtimeSourceSnapshot().sha256,source.sha256);assert.deepEqual(errors,[]);assert.equal(measured.dropped,0);
  assert.equal(central.length,1,'Central preparation restarted during the local detour.');
  assert.notEqual(central[0].outcome,'cancelled');assert.equal(central[0].readyBeforeBoundaryNeeded,true);
  assert.equal(central[0].readyBeforeBoundary,true);assert(measured.final.streaming.activeIds.includes('central-market'));
  assert(!transitions.reports.some(r=>['noble-quarter','temple-quarter','west-bank'].includes(r.areaId)&&r.requestAtMs>=measured.startMs));
  console.log(JSON.stringify({directory,source:source.sha256,durationMs:report.durationMs,arrivals:arrivals.length,
    centralRequests:central.length,requestToReadyMs:central[0].requestToReadyMs,readyLeadBeforeNeededMs:central[0].readyLeadBeforeBoundaryNeededMs,errors}));
}catch(error){write('failure.json',{error:String(error),errors});throw error;}
finally{await browser.close();}
