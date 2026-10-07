import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Focused native-input correctness check. Explicit warm/setup and recording
// overhead exclude this diagnostic from whole-route cadence acceptance.
const directory=resolve(process.env.VOXARRIUM_CITADEL_RETURN_DIR??'artifacts/m9/citadel-return-native');
assert(!existsSync(directory),'Use a fresh directory; preserve previous evidence.');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[],cases=[];
const write=(name,data)=>writeFileSync(resolve(directory,name),JSON.stringify(data,null,2)+'\n');
write('runtime-source.json',source);
write('capture-protocol.json',{tool:'tools/verify-citadel-return.mjs',sha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  scope:'Focused actual-input correctness diagnostic with explicit supported setup, screenshots and recording overhead; separate from native cadence acceptance.'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:5173/?scene=m9&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:180000});
  await page.locator('#start').click();
  for(const mode of ['third-person','first-person']){
    const setup=await page.evaluate(async mode=>{
      const h=window.__VOXARRIUM__;h.bookmark('m9.citadel.approach',mode);h.step(180);await h.settleStreaming();
      h.bookmark('m9.citadel.court',mode);h.step(180);await h.settleStreaming();
      h.teleport({x:150.2655792236328,y:50.01551818847656,z:-604.7804565429688});h.step(60);await h.settleStreaming();
      h.environment('clear','day',true);return h.snapshot();
    },mode);
    assert.equal(setup.facts.backend,'WebGPU');assert.equal(setup.state.player.grounded,true);
    assert(setup.streaming.activeIds.includes('citadel'));assert.deepEqual(setup.streaming.errors,[]);
    const ids=setup.state.population.map(n=>n.id),setupResets=setup.state.resets;
    await page.screenshot({path:resolve(directory,`${mode}-setup.png`)});
    await page.evaluate(()=>{
      const stream=document.querySelector('#world').captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:3500000});
      const chunks=[],stopped=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
      };});
      window.__citadelReturnMovie={recorder,stopped};recorder.start();window.__VOXARRIUM__.freeze(false);
    });
    const legs=[],started=Date.now();
    for(const [name,target] of [['descent',[185,-550]],['ascent',[150,-605]]]){
      const samples=[],legStart=Date.now();let running=true,crest=false,toe=false,arrived=false;
      await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
      while(Date.now()-legStart<120000){
        const sample=await page.evaluate(target=>{
          const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-target[0],p.z-target[1]),-.08);
          const s=h.snapshot();return {position:p,grounded:s.state.player.grounded,resets:s.state.resets,paused:s.state.paused,
            elapsed:s.state.elapsed,environmentTime:s.state.environment.time,focused:document.hasFocus(),visibility:document.visibilityState,
            pointerLocked:document.pointerLockElement?.id==='world',mode:s.state.camera.mode,distance:Math.hypot(p.x-target[0],p.z-target[1])};
        },target);
        samples.push({elapsedMs:Date.now()-legStart,...sample});
        write('progress.json',{sourceSha256:source.sha256,mode,leg:name,cases,setupResets,samples,errors});
        assert.equal(sample.grounded,true,JSON.stringify({mode,leg:name,sample}));assert.equal(sample.resets,setupResets);
        assert.equal(sample.paused,false);assert.equal(sample.focused,true);assert.equal(sample.visibility,'visible');assert.equal(sample.pointerLocked,true);
        assert.equal(sample.mode,mode);
        if(name==='descent'&&!crest&&sample.position.z>-596.7){await page.screenshot({path:resolve(directory,`${mode}-descent-crest.png`)});crest=true;}
        if(name==='descent'&&!toe&&sample.position.z>-590){await page.screenshot({path:resolve(directory,`${mode}-descent-toe.png`)});toe=true;}
        if(sample.distance<1.8&&running){running=false;await page.keyboard.up('ShiftLeft');}
        if(sample.distance<.55){arrived=true;break;}
        await page.waitForTimeout(80);
      }
      await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
      assert(arrived,`${mode} ${name} exhausted bounded120second leg`);
      const end=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
      assert.equal(end.state.player.grounded,true);assert.equal(end.state.resets,setupResets);assert.deepEqual(end.streaming.errors,[]);
      assert.deepEqual(end.state.population.map(n=>n.id),ids);assert.equal(end.npcTiers.uniqueIds,224);assert.equal(end.audio.activeLoops,5);
      await page.screenshot({path:resolve(directory,`${mode}-${name}-arrival.png`)});
      legs.push({name,target,samples,end,durationMs:Date.now()-legStart});
    }
    const stoppedAt=Date.now();
    const bytes=await page.evaluate(async()=>{const m=window.__citadelReturnMovie;m.recorder.stop();const bytes=await m.stopped;delete window.__citadelReturnMovie;return bytes;});
    writeFileSync(resolve(directory,`${mode}-return.webm`),Buffer.from(bytes));
    await page.evaluate(()=>window.__VOXARRIUM__.freeze(true));
    cases.push({mode,setup,setupResets,legs,recordedDurationMs:stoppedAt-started,encodingDrainMs:Date.now()-stoppedAt,bytes:bytes.length});
    write('partial-evidence.json',{sourceSha256:source.sha256,cases,errors});
  }
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  write('evidence.json',{sourceSha256:source.sha256,browser:browser.version(),viewport:{width:1440,height:900,dpr:1},
    scope:'Explicit supported/prewarmed setup per camera, then actual continuously held W/Shift descent and ascent with ordinary yaw around80ms. Grounded at every observed native readback; fixed-step regressions separately check every simulation step. Screenshots/video/readbacks add overhead; no native cadence, full-route continuity or soak claim.',cases,errors});
  console.log(JSON.stringify({directory,sourceSha256:source.sha256,cases:cases.map(c=>({mode:c.mode,legs:c.legs.map(l=>({name:l.name,samples:l.samples.length,durationMs:l.durationMs})),bytes:c.bytes})),errors}));
}catch(error){
  write('failure.json',{error:String(error),sourceSha256:source.sha256,cases,errors,snapshot:await page.evaluate(()=>window.__VOXARRIUM__?.snapshot()).catch(()=>null)});
  throw error;
}finally{
  await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});await browser.close();
}
