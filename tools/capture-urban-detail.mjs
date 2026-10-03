import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { runtimeSourceSnapshot } from './runtime-source-snapshot.mjs';

// Supplementary first-person hero composition and bounded local audio evidence.
// Explicit bookmark setup is separate from traversal and performance proof.
const directory='artifacts/m7/detail-final';mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),states={},audio=[],errors=[];
const browser=await chromium.launch({channel:'chrome',headless:false});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:5173/?scene=m7&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair{visibility:hidden}'});
  for(const id of ['central-market','lower-canal']){
    await page.evaluate(async id=>{const h=window.__VOXARRIUM__;h.bookmark(`m7.${id}.hero`,'first-person');
      h.environment('clear','day',true);h.step(180);await h.settleStreaming();document.body.classList.add('review');},id);
    const s=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
    assert.equal(s.state.resets,0);assert.equal(s.state.player.grounded,true);assert(s.streaming.activeIds.includes(id));
    states[`${id}-hero`]={...s,captureMethod:'Supplementary first-person hero view, explicit authored bookmark, separate from moving route proof.'};
    await page.screenshot({path:`${directory}/${id}-hero.png`});
    await page.evaluate(async id=>{const h=window.__VOXARRIUM__;h.bookmark(`m7.${id}.street`);h.step(180);await h.settleStreaming();h.freeze(false);},id);
    for(const [weather,light,seconds] of [['clear','day',11],['clear','night',3],['rain','day',3]]){
      await page.evaluate(({weather,light})=>window.__VOXARRIUM__.environment(weather,light,true),{weather,light});
      await page.waitForTimeout(1100);
      const bytes=await page.evaluate(seconds=>window.__VOXARRIUM__.recordAudio(seconds),seconds);
      writeFileSync(`${directory}/${id}-${weather}-${light}.webm`,Buffer.from(bytes));
      const s=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
      assert.equal(s.audio.status,'running');assert.equal(s.audio.activeLoops,5);assert.equal(s.audio.districtEmitters.zone,id);
      assert.equal(s.state.environment.weather,weather);assert.equal(s.state.environment.timeOfDay,light);
      assert(s.audio.outputRms>0);assert.equal(s.state.resets,0);assert.equal(s.state.player.grounded,true);
      audio.push({district:id,weather,light,seconds,bytes:bytes.length,state:s.state.environment,audio:s.audio});
    }
  }
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  writeFileSync(`${directory}/evidence.json`,JSON.stringify({measuredAt:new Date().toISOString(),browser:browser.version(),sourceSha256:source.sha256,
    scope:'Authored first-person hero setups and stationary local synthesized audio recordings after actual Explore gesture; no traversal, fidelity score or performance claim.',states,audio,errors},null,2)+'\n');
  console.log(JSON.stringify({directory,captures:Object.keys(states),audio:audio.map(a=>({district:a.district,weather:a.weather,light:a.light,bytes:a.bytes,levels:a.audio.levels})),errors}));
}finally{await browser.close();}
