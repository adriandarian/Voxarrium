import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Enclosed alley inspection supplements the new wards' wider court approaches.
const directory='artifacts/m8/alley-review';mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[],browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.freeze(true);h.bookmark('m7.central-market.alley','first-person');
    h.environment('clear','day',true);await h.settleStreaming();h.step(180);await h.settleStreaming();});
  const state=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(state.facts.backend,'WebGPU');
  assert.equal(state.facts.adapterInfoSource,'initialized GPUDevice.adapterInfo');
  assert.deepEqual(state.streaming.errors,[]);
  assert.equal(state.state.resets,0);assert.equal(state.state.player.grounded,true);assert(state.streaming.activeIds.includes('central-market'));
  await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair{visibility:hidden}'});
  await page.evaluate(()=>document.body.classList.add('review'));
  await page.screenshot({path:`${directory}/first-person-service-alley.png`});
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  writeFileSync(`${directory}/capture-state.json`,JSON.stringify({sourceSha256:source.sha256,browser:browser.version(),
    scope:'Separate explicit first-person stock-alley inspection in M8, using preserved M7 Central Market architecture. No natural-spawn traversal or cadence claim.',state,errors},null,2)+'\n');
  console.log(JSON.stringify({directory,backend:state.facts.backend,errors}));
}finally{await browser.close();}
