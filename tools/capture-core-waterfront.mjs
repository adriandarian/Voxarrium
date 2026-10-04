import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// A separate inspection setup supplements the landward quay capture. No timing claim.
const directory='artifacts/m8/waterfront-review';mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  const approach=await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.freeze(true);h.bookmark('m7.lower-canal.quay','first-person');
    h.environment('clear','day',true);await h.settleStreaming();h.step(180);const arrivals=[];
    // Enter from the resident upper quay after its streamed dock is active. A
    // direct low dock bookmark falls before cold preparation has completed.
    for(const [x,z] of [[264,-112],[272.65,-112],[272.30625,-113.1],[266.68125,-131.1],[265.43125,-135.1]]){
      let frames=0;for(;frames<1800;frames+=3){const p=h.position(),d=Math.hypot(p.x-x,p.z-z);if(d<.18)break;
        h.steer(Math.atan2(p.x-x,p.z-z),-.08);h.step(3,{forward:d<.8?Math.min(1,d*1.7):1});await h.settleStreaming();}
      if(frames===1800)throw new Error(`Cargo approach stalled at ${x},${z}`);
      arrivals.push({target:{x,z},position:h.position(),frames,resets:h.snapshot().state.resets});
    }
    h.look(-Math.PI*.55,-.25);h.step(30);return arrivals;});
  const state=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(state.facts.backend,'WebGPU');
  assert.equal(state.facts.adapterInfoSource,'initialized GPUDevice.adapterInfo');
  assert.deepEqual(state.streaming.errors,[]);
  assert.equal(state.state.resets,0);assert.equal(state.state.player.grounded,true);assert(state.streaming.activeIds.includes('lower-canal'));
  await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair{visibility:hidden}'});
  await page.evaluate(()=>document.body.classList.add('review'));
  await page.screenshot({path:`${directory}/first-person-waterfront-outward.png`});
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  writeFileSync(`${directory}/capture-state.json`,JSON.stringify({sourceSha256:source.sha256,browserVersion:browser.version(),
    scope:'Separate explicit first-person upper-quay setup followed by fixed-step ordinary-controller descent to the cargo landing facing the water. Cold low-dock bookmark recovery is a capture setup limitation; whole-core natural-spawn traversal and cadence have separate evidence.',approach,state,errors},null,2)+'\n');
  console.log(JSON.stringify({directory,backend:state.facts.backend,errors}));
}finally{await browser.close();}
