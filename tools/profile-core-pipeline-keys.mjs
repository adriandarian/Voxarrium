import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { runtimeSourceSnapshot } from './runtime-source-snapshot.mjs';

// Diagnostic source interception only; shader text observation changes timing.
// This is never cadence/readiness acceptance evidence.
const directory=resolve('artifacts/m8/profiling/pipeline-reload-keys-instances');
mkdirSync(directory,{recursive:true});
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const source=runtimeSourceSnapshot(), errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
let intercepted;
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__pipelineDiagnostic={phase:'startup',samples:[],names:[],seen:[],bytes:0,dropped:0};});
  await page.route(/\/src\/render\/pipeline-cache\.ts(?:\?|$)/,async route=>{
    const response=await route.fetch(), original=await response.text();
    assert(original.includes('function retain(pipeline, area) {'));
    assert(original.includes('const pipeline = original.call(this, object, promises);'));
    const body=original.replace('const captured = new WeakMap();','const captured = new WeakMap(); const diagnosticLabels = new WeakMap();')
      .replace('const pipeline = original.call(this, object, promises);','const pipeline = original.call(this, object, promises); diagnosticLabels.set(pipeline, object.object.name);')
      .replace('function retain(pipeline, area) {',`function retain(pipeline, area) {
        const diagnostic=window.__pipelineDiagnostic, name=diagnosticLabels.get(pipeline), label=area+':'+name;
        if (name?.includes('.instances.') && !diagnostic.names.includes(label) && diagnostic.names.filter(x=>x.startsWith(area+':')).length<8) diagnostic.names.push(label);
        const key=diagnostic.phase+':'+label+':'+pipeline.cacheKey;
        if (diagnostic.names.includes(label) && !diagnostic.seen.includes(key)) {
          const sample={phase:diagnostic.phase,area,name,key:pipeline.cacheKey,vertex:pipeline.vertexProgram.code,fragment:pipeline.fragmentProgram.code};
          const bytes=sample.vertex.length+sample.fragment.length;
          if (diagnostic.samples.length<128 && diagnostic.bytes+bytes<=8388608) {diagnostic.samples.push(sample);diagnostic.seen.push(key);diagnostic.bytes+=bytes;} else diagnostic.dropped++;
        }`);
    intercepted={url:route.request().url(),originalSha256:createHash('sha256').update(original).digest('hex'),diagnosticSha256:createHash('sha256').update(body).digest('hex')};
    await route.fulfill({response,body});
  });
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  assert(intercepted,'Diagnostic module intercept did not match the cache-busted Vite URL.');
  await page.locator('#start').click();
  await page.waitForFunction(()=>{const s=window.__VOXARRIUM__.snapshot();return s.streaming.loadedIds.includes('river-market')&&!s.streaming.pendingIds.length;},undefined,{timeout:120000,polling:1000});
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  const walk=async target=>{
    const began=Date.now();await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
    try { for(;;){assert(Date.now()-began<120000,'Diagnostic walk stalled.');
      const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(distance<.55)break;await page.waitForTimeout(80);
    }} finally {await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');}
  };
  await walk([5,-1]);await walk([baseline.state.player.position.x,baseline.state.player.position.z]);
  await page.waitForFunction(()=>{const s=window.__VOXARRIUM__.snapshot();return s.streaming.loadedIds.length===1&&s.streaming.loadedIds[0]==='rural'&&!s.streaming.pendingIds.length&&!s.streaming.retiringIds.length;},undefined,{timeout:120000,polling:1000});
  await page.evaluate(()=>{window.__pipelineDiagnostic.phase='reload';});
  for(const point of baseline.city.route.slice(1,5))await walk([point.x,point.z]);
  await page.evaluate(()=>window.__VOXARRIUM__.settleStreaming());
  const samples=await page.evaluate(()=>window.__pipelineDiagnostic);
  write('shader-samples.json',samples);write('runtime-source.json',source);
  write('diagnostic.json',{sourceSha256:source.sha256,intercepted,browser:browser.version(),headless:true,errors,
    samples:samples.samples.length,bytes:samples.bytes,dropped:samples.dropped,
    scope:'Bounded shader-text samples for first eight instanced mesh names per area, startup then actual-input Rural departure/River reload. Diagnostic module response intercept adds plain-data observation, max128 samples/8MiB. No timing acceptance/causal/GPU time claim; runtime file untouched. External owner load uncontrolled.'});
  assert(intercepted);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({samples:samples.samples.length,bytes:samples.bytes,dropped:samples.dropped,errors}));
} finally {await browser.close();}
