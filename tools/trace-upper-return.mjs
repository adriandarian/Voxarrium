import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Explicit Central setup, then a bounded actual-input downhill return. This
// traces the segment implicated by the failed whole-route idle-window run.
// Setup and tracing overhead exclude it from acceptance cadence.
const directory=resolve(process.env.VOXARRIUM_RETURN_TRACE_DIR??'artifacts/m9/profiling/central-garden-return');
mkdirSync(directory,{recursive:true});
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const source=runtimeSourceSnapshot(),errors=[],bufferUsage=[];
const categories=['devtools.timeline','v8','disabled-by-default-v8.gc','blink.user_timing',
  'toplevel','gpu','gpu.dawn','disabled-by-default-gpu.dawn','renderer.scheduler'];
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let cdp,tracing=false,completed;
async function stopTrace(){
  if(!tracing)return;
  await cdp.send('Tracing.end');tracing=false;
  const complete=await completed,output=createWriteStream(resolve(directory,'browser-performance-trace.json'));
  write('trace-completion.json',{dataLossOccurred:complete.dataLossOccurred??null});
  for(;;){const chunk=await cdp.send('IO.read',{handle:complete.stream});
    if(!output.write(Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8')))await once(output,'drain');
    if(chunk.eof)break;
  }
  output.end();await once(output,'finish');await cdp.send('IO.close',{handle:complete.stream});
}
try{
  cdp=await context.newCDPSession(page);
  await page.goto('http://127.0.0.1:5173/?scene=m9&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  const setupResets=await page.evaluate(async()=>{const h=window.__VOXARRIUM__;h.freeze(true);
    h.bookmark('m7.central-market.street','third-person');h.environment('clear','day',true);
    h.step(180);await h.settleStreaming();
    h.teleport({x:110,y:12.04,z:-235});h.step(60);await h.settleStreaming();
    return h.snapshot().state.resets;
  });
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(baseline.facts.backend,'WebGPU');assert.equal(baseline.facts.adapter.vendor,'amd');
  assert.equal(baseline.facts.adapter.architecture,'rdna-2');assert.equal(baseline.state.player.grounded,true);
  assert.deepEqual(baseline.streaming.errors,[]);assert(baseline.streaming.activeIds.includes('central-market'));
  write('startup.json',baseline);write('runtime-source.json',source);
  const inventory=await cdp.send('Tracing.getCategories');
  write('trace-category-inventory.json',{inventory:inventory.categories,selected:categories});
  cdp.on('Tracing.bufferUsage',u=>{if(bufferUsage.length<64)bufferUsage.push(u);});
  completed=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.start',{traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:65536,
    includedCategories:categories,excludedCategories:['*']},transferMode:'ReturnAsStream',bufferUsageReportingInterval:1000});
  tracing=true;
  await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.resetTail();h.freeze(false);
    performance.mark('voxarrium:upper-return-trace-start');
    const m=window.__upperReturnTrace={frames:[],capacity:10000,dropped:0,start:performance.now(),last:null,active:true};
    const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<m.capacity)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}
      m.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  const started=Date.now(),route=[[115,-200],[118,-160],[110,-110],[145,-105],[190,-80],[240,-55]],arrivals=[];
  traversal: for(const target of route){
    const legStart=Date.now();let running=true;
    await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    for(;;){
      assert(Date.now()-legStart<60000,'Diagnostic leg stalled');
      const result=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(result<.55)break;
      if(result<1.8&&running){await page.keyboard.up('ShiftLeft');running=false;}
      // Stop steering/input before exporting a large native trace. Exporting
      // while W remained held overshot the road in the preceding diagnostic.
      if(Date.now()-started>45000)break traversal;
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    arrivals.push(await page.evaluate(()=>{const s=window.__VOXARRIUM__.snapshot();return{position:s.state.player.position,active:s.streaming.activeIds};}));
    if(Date.now()-started>45000)break;
  }
  await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
  const measurement=await page.evaluate(()=>{const m=window.__upperReturnTrace;m.active=false;
    const sorted=m.frames.map(f=>f.interval).filter(n=>n>0).sort((a,b)=>a-b),p=f=>sorted[Math.ceil(sorted.length*f)-1];
    return {startMs:m.start,endMs:performance.now(),samples:sorted.length,p50:p(.5),p95:p(.95),p99:p(.99),max:sorted.at(-1),
      frames:m.frames,longFrames:m.frames.filter(f=>f.interval>33.3),dropped:m.dropped,final:window.__VOXARRIUM__.snapshot()};
  });
  await stopTrace();
  assert.equal(runtimeSourceSnapshot().sha256,source.sha256);assert.deepEqual(errors,[]);
  assert.deepEqual(measurement.final.streaming.errors,[]);assert.equal(measurement.final.state.resets,setupResets);assert.equal(measurement.dropped,0);
  const report={browser:browser.version(),runtimeSourceSha256:source.sha256,headless:true,physicalMouseCapture:false,
    viewport:{width:1920,height:1080,dpr:1},scene:'m9',traceCategories:categories,bufferUsage,traceBufferKiB:65536,maximumTraceSeconds:45,
    scope:'Explicit supported Central street setup, followed by actual W/Shift downhill return toward Garden/South Gate. At most45s native tracing, finite64MiB buffer. This is a focused diagnostic with cold browser caches and tracing overhead, not natural whole-route acceptance cadence or proof of the earlier failure cause. Native spans are CPU/browser wall signals, not GPU execution or OS scheduling measurements.',
    setupResets,route,arrivals,baseline,...measurement,errors};
  write('diagnostic.json',report);
  console.log(JSON.stringify({directory,source:source.sha256,samples:measurement.samples,max:measurement.max,p99:measurement.p99,bufferUsage,errors}));
}catch(error){write('failure.json',{error:String(error),errors,bufferUsage,snapshot:await page.evaluate(()=>window.__VOXARRIUM__?.snapshot()).catch(()=>null)});throw error;}
finally{await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});
  if(tracing)await stopTrace().catch(()=>{});await context.close();await browser.close();}
