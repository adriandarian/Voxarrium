import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { runtimeSourceSnapshot } from './runtime-source-snapshot.mjs';

const directory='artifacts/m7/motion';mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[],clips=[];
const browser=await chromium.launch({channel:'chrome',headless:false});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const cases=[
  {id:'central-market',name:'merchant-road',bookmark:'city.central-market',mode:'third-person',targets:[[146,-235]]},
  {id:'central-market',name:'service-alley',bookmark:'m7.central-market.alley',mode:'first-person',targets:[[67,-264]]},
  {id:'lower-canal',name:'quay-road',bookmark:'city.lower-canal',mode:'third-person',targets:[[315,-87]]},
  {id:'lower-canal',name:'cargo-stairs',bookmark:'m7.lower-canal.dock',mode:'first-person',setup:{x:272.30625,y:4,z:-113.1},targets:[[266.68125,-131.1],[265.43125,-135.1]]},
];
try{
  await page.goto('http://127.0.0.1:5173/?scene=m7&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  for(const c of cases){
    await page.evaluate(async c=>{const h=window.__VOXARRIUM__;h.bookmark(c.bookmark,c.mode);if(c.setup)h.teleport(c.setup);
      h.environment('clear','day',true);h.step(180);await h.settleStreaming();h.freeze(false);},c);
    const start=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
    const setupResets=start.state.resets;
    assert.equal(start.state.player.grounded,true);assert.equal(setupResets,c.setup?1:0);assert(start.streaming.activeIds.includes(c.id));
    await page.evaluate(()=>{
      const stream=document.querySelector('#world').captureStream(30);
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:3500000});
      const chunks=[];const stopped=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};});
      window.__urbanMovie={recorder,stopped};recorder.start();
    });
    const began=Date.now(),samples=[];let targetIndex=0,nextFrame=4000;
    await page.keyboard.down('KeyW');
    while(Date.now()-began<12000){
      const result=await page.evaluate(target=>{const h=window.__VOXARRIUM__,p=h.position();if(target)h.steer(Math.atan2(p.x-target[0],p.z-target[1]),-.08);
        const s=h.snapshot();return {position:p,grounded:s.state.player.grounded,resets:s.state.resets,distance:target?Math.hypot(p.x-target[0],p.z-target[1]):0};},c.targets[targetIndex]);
      assert.equal(result.resets,setupResets);samples.push({elapsedMs:Date.now()-began,...result});
      if(targetIndex<c.targets.length&&result.distance<.5){targetIndex++;if(targetIndex===c.targets.length)await page.keyboard.up('KeyW');}
      if(Date.now()-began>=nextFrame){await page.screenshot({path:`${directory}/${c.id}-${c.name}-${nextFrame/1000}s.png`});nextFrame+=4000;}
      await page.waitForTimeout(100);
    }
    await page.keyboard.up('KeyW');
    const stoppedAt=Date.now();
    const bytes=await page.evaluate(async()=>{const m=window.__urbanMovie;m.recorder.stop();const bytes=await m.stopped;delete window.__urbanMovie;return bytes;});
    writeFileSync(`${directory}/${c.id}-${c.name}.webm`,Buffer.from(bytes));
    const end=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
    assert.equal(end.state.player.grounded,true);assert.equal(end.state.resets,setupResets);assert.equal(end.state.paused,false);assert.deepEqual(end.streaming.errors,[]);
    assert(Math.hypot(end.state.player.position.x-start.state.player.position.x,end.state.player.position.z-start.state.player.position.z)>8);
    clips.push({...c,start,end,samples,setupResets,bytes:bytes.length,recordedDurationMs:stoppedAt-began,encodingDrainMs:Date.now()-stoppedAt});
  }
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  writeFileSync(`${directory}/evidence.json`,JSON.stringify({browser:browser.version(),sourceSha256:source.sha256,
    scope:'Four bounded actual-W-input moving review excerpts, one explicit setup per clip, yaw steering every100ms, native WebGPU. Canvas video recording and screenshots add overhead; these clips are excluded from performance measurements. Full continuity is proved separately by natural-spawn circuits.',clips,errors},null,2)+'\n');
  console.log(JSON.stringify({directory,clips:clips.map(c=>({name:c.name,mode:c.mode,bytes:c.bytes,recordedDurationMs:c.recordedDurationMs,encodingDrainMs:c.encodingDrainMs})),errors}));
}finally{await page.keyboard.up('KeyW').catch(()=>{});await browser.close();}
