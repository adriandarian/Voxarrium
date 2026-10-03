import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const directory='artifacts/m7/quay-handoff';mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
const page=await browser.newPage({viewport:{width:1440,height:900}}),arrivals=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const route=[[315,-87],[315,-65],[285,-65],[260,-65],[260,-76],[262,-82],[264,-99],[264,-112],
  [264,-99],[262,-82],[260,-76],[260,-65],[285,-65],[315,-65],[315,-87],[310,-165]];
try{
  await page.goto('http://127.0.0.1:5173/?scene=m7&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.bookmark('city.lower-canal');h.step(180);await h.settleStreaming();h.freeze(false);});
  for(const [index,target] of route.entries()){
    const start=Date.now();let running=true;await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    for(;;){
      assert(Date.now()-start<40000,`Quay probe stalled at ${index}`);
      const s=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);
        const s=h.snapshot();return {distance:Math.hypot(p.x-x,p.z-z),position:p,resets:s.state.resets,loaded:s.streaming.loadedIds,errors:s.streaming.errors};},target);
      assert.equal(s.resets,0);assert.deepEqual(s.errors,[]);assert(s.loaded.length<=2);
      if(s.distance<.55)break;if(running&&s.distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    const s=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());assert.equal(s.state.player.grounded,true);assert.equal(s.state.resets,0);
    arrivals.push({index,target,position:s.state.player.position,loaded:s.streaming.loadedIds,active:s.streaming.activeIds,counts:s.streaming.counts});
  }
  assert.deepEqual(errors,[]);writeFileSync(`${directory}/probe.json`,JSON.stringify({browser:browser.version(),
    scope:'Targeted actual W/Shift north-quay exit/reentry after one explicitly documented Lower Canal center setup. No timing or natural-spawn continuity claim.',route,arrivals,errors},null,2)+'\n');
  console.log(JSON.stringify({directory,arrivals:arrivals.length,errors}));
}catch(e){writeFileSync(`${directory}/failure.json`,JSON.stringify({error:String(e),arrivals,errors,snapshot:await page.evaluate(()=>window.__VOXARRIUM__?.snapshot())},null,2));throw e;}
finally{await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});await browser.close();}
