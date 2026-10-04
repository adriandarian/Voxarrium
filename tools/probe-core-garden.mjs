import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Focused retention check with explicit setup; no cadence or natural-spawn claim.
const source=runtimeSourceSnapshot(),errors=[],arrivals=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.freeze(true);h.teleport({x:315,y:4,z:-65});
    h.environment('clear','day',true);await h.settleStreaming();h.step(180);await h.settleStreaming();});
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.deepEqual(baseline.streaming.errors,[]);
  assert.equal(baseline.state.player.grounded,true);assert(!baseline.streaming.loadedIds.includes('garden-terrace'));
  const setupResets=baseline.state.resets,started=Date.now();
  await page.evaluate(()=>{window.__VOXARRIUM__.resetTail();window.__VOXARRIUM__.freeze(false);});
  for(const target of [[260,-65],[240,-55],[220,-65],[190,-80]]){
    let running=true;await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    for(;;){
      assert(Date.now()-started<120000,'Focused Garden approach stalled');
      const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(distance<.55)break;if(running&&distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    const state=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
    assert.equal(state.state.resets,setupResets);assert.equal(state.state.paused,false);arrivals.push({target,state});
  }
  const final=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.deepEqual(final.streaming.errors,[]);
  const garden=final.tail.transitions.reports.filter(r=>r.areaId==='garden-terrace');
  assert.equal(garden.length,1,'The fork cancelled/restarted Garden preparation');
  assert(garden[0].readyAtMs!==null);assert.equal(garden[0].readyBeforeBoundary,true);assert.equal(garden[0].readyBeforeBoundaryNeeded,true);
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  const report={sourceSha256:source.sha256,browser:browser.version(),setupResets,baseline,arrivals,final,errors,
    scope:'Separate explicit supported South Gate setup, real staged Gate/Canal preparation, then ordinary W/Shift and 80ms yaw steering through the Garden junction. Braking/idle/acceleration retention check only; concurrent correctness checks exclude any cadence claim. Six exclusive natural-spawn circuits are separate completion gates.'};
  writeFileSync('artifacts/m8/checks/garden-actual-input-probe.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source:source.sha256,gardenRequests:garden.length,neededLeadMs:garden[0].readyLeadBeforeBoundaryNeededMs,errors}));
}finally{await browser.close();}
