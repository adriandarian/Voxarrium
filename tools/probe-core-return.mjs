import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Focused natural-spawn actual-input Rural/River return, not core cadence.
const source=runtimeSourceSnapshot(),errors=[],arrivals=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.deepEqual(baseline.streaming.errors,[]);assert.equal(baseline.state.resets,0);
  const outward=baseline.city.route.slice(1,7).map(p=>[p.x,p.z]);
  const route=[...outward,...outward.slice(0,-1).reverse(),[baseline.state.player.position.x,baseline.state.player.position.z]];
  const started=Date.now();
  for(const target of route){
    let running=true;await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    for(;;){
      assert(Date.now()-started<120000,'Focused Rural return stalled');
      const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();
        h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(distance<.55)break;if(running&&distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    const s=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
    assert.equal(s.state.resets,0);assert.equal(s.state.paused,false);assert.equal(s.state.player.grounded,true);
    assert.deepEqual(s.streaming.errors,[]);arrivals.push({target,loaded:s.streaming.loadedIds,position:s.state.player.position});
  }
  await page.waitForTimeout(2300);
  const final=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert(arrivals.some(a=>a.loaded.includes('river-market')));assert.deepEqual(final.streaming.loadedIds,['rural']);
  assert.deepEqual(final.streaming.pendingIds,[]);assert.deepEqual(final.streaming.retiringIds,[]);
  assert.deepEqual(final.streaming.errors,[]);assert.equal(final.state.resets,0);assert.deepEqual(errors,[]);
  assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  const report={sourceSha256:source.sha256,browser:browser.version(),headless:true,physicalMouseCapture:false,
    scope:'Natural Rural spawn, actual W/Shift with 80 ms yaw steering into River and back, then 2.3 s parked endpoint. No bookmark, teleport, fixed stepping or reload. Concurrent repository checks exclude a cadence claim; all-seven-ward repeated ownership is separate.',
    baseline,route,arrivals,final,errors};
  writeFileSync('artifacts/m8/checks/rural-return-actual-input.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source:source.sha256,durationMs:Date.now()-started,arrivals:arrivals.length,loaded:final.streaming.loadedIds,errors}));
}finally{await browser.close();}
