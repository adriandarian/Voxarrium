import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Three bounded diagnostic readbacks from the same frozen, prepared scene.
// Full, discarded and compact responses all execute the same snapshot builder.
const directory=resolve('artifacts/m8/profiling/headless-readback-cost');
mkdirSync(directory,{recursive:true});
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const source=runtimeSourceSnapshot(),errors=[],variants=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.freeze(true);
    h.bookmark('m8.civic-terrace.street','third-person');h.environment('clear','day',true);h.step(180);await h.settleStreaming();
    // Explicit setup only. Move a few metres inside Civic so the ordinary
    // demand policy admits Central, then settle both before profiling.
    h.step(60,{forward:1});await h.settleStreaming();});
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(baseline.facts.backend,'WebGPU');assert.equal(baseline.facts.adapter.vendor,'amd');
  assert.equal(baseline.facts.adapter.architecture,'rdna-2');assert.equal(baseline.state.resets,0);
  assert.deepEqual(baseline.streaming.errors,[]);assert(baseline.streaming.loadedIds.includes('civic-terrace'));
  assert(baseline.streaming.loadedIds.includes('central-market'));
  write('startup.json',baseline);write('runtime-source.json',source);
  for(const mode of ['full','discard','compact']){
    await page.evaluate(()=>{const m=window.__readbackProfile={frames:[],capacity:2000,dropped:0,start:performance.now(),last:null,active:true};
      const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<m.capacity)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}
        m.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);});
    await page.waitForTimeout(200);
    const wallStart=Date.now();
    const result=await page.evaluate(mode=>{const begin=performance.now(),s=window.__VOXARRIUM__.snapshot(),built=performance.now();
      const common={beginMs:begin,builtMs:built,snapshotCpuWallMs:built-begin,
        ownership:{loaded:s.streaming.loadedIds,pending:s.streaming.pendingIds,retiring:s.streaming.retiringIds,
          cache:s.render.streamingResources.cache.entries,npcIds:s.npcTiers.uniqueIds,resets:s.state.resets}};
      if(mode==='full')return {...common,snapshot:s};
      if(mode==='discard')return common;
      // Same builder, with large retrospective tail records removed before
      // CDP serialization. Full chronology is still saved outside this window.
      return {...common,state:s.state,streaming:s.streaming,physics:s.physics,npcTiers:s.npcTiers,audio:s.audio};
    },mode);
    const readbackWallMs=Date.now()-wallStart;
    await page.waitForTimeout(200);
    const frames=await page.evaluate(()=>{const m=window.__readbackProfile;m.active=false;return m;});
    const bytes=Buffer.byteLength(JSON.stringify(result));
    assert.deepEqual(result.ownership.loaded,baseline.streaming.loadedIds);assert.equal(result.ownership.resets,0);assert.equal(frames.dropped,0);
    const row={mode,readbackWallMs,responseBytes:bytes,snapshotCpuWallMs:result.snapshotCpuWallMs,
      beginMs:result.beginMs,builtMs:result.builtMs,ownership:result.ownership,frames:frames.frames,
      maxIntervalMs:Math.max(...frames.frames.map(f=>f.interval)),dropped:frames.dropped};
    variants.push(row);console.log(JSON.stringify({...row,frames:undefined}));
  }
  const final=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.deepEqual(errors,[]);assert.deepEqual(final.streaming.errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  write('profile.json',{sourceSha256:source.sha256,browser:browser.version(),headless:true,physicalMouseCapture:false,
    scope:'Explicit supported Civic/Central frozen inspection setup, both wards prepared; same snapshot builder executes once for each full/discard/compact transfer. Browser continues rendering. Each sample includes its readback and 200 ms before/after. Node JSON byte counting and full startup/final exports occur outside sample windows. Diagnostic CPU/protocol cost, not whole-route acceptance, GPU execution or hardware-matched causal proof. External owner workloads uncontrolled.',
    baseline,variants,final,errors});
}catch(error){write('failure.json',{error:String(error),errors});throw error;}
finally{await browser.close();}
