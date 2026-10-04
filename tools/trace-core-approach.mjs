import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// One bounded natural-spawn approach trace. Instrumented cadence is diagnostic.
const directory=resolve('artifacts/m8/profiling/headless-natural-approach');
mkdirSync(directory,{recursive:true});
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const source=runtimeSourceSnapshot(),errors=[],arrivals=[],bufferUsage=[];
const categories=['devtools.timeline','v8','disabled-by-default-v8.gc','blink.user_timing',
  'toplevel','gpu','gpu.dawn','disabled-by-default-gpu.dawn','renderer.scheduler'];
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let cdp,tracing=false,completed,traceCompletion;
async function stopTrace(){
  if(!tracing)return;
  await cdp.send('Tracing.end');tracing=false;
  traceCompletion=await completed;
  const {stream}=traceCompletion,output=createWriteStream(resolve(directory,'browser-performance-trace.json'));
  for(;;){const chunk=await cdp.send('IO.read',{handle:stream});
    if(!output.write(Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8')))await once(output,'drain');
    if(chunk.eof)break;
  }
  output.end();await once(output,'finish');await cdp.send('IO.close',{handle:stream});
}
try{
  cdp=await context.newCDPSession(page);
  await page.goto('http://127.0.0.1:5173/?scene=m8&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  await page.evaluate(()=>window.__VOXARRIUM__.environment('clear','day',true));
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(baseline.facts.backend,'WebGPU');assert.equal(baseline.facts.adapter.vendor,'amd');
  assert.equal(baseline.facts.adapter.architecture,'rdna-2');assert.equal(baseline.state.resets,0);
  assert.deepEqual(baseline.streaming.errors,[]);
  write('startup.json',baseline);write('runtime-source.json',source);
  const route=baseline.city.route.slice(1,11).map(p=>[p.x,p.z]);
  write('trace-category-inventory.json',{inventory:(await cdp.send('Tracing.getCategories')).categories,selected:categories});
  cdp.on('Tracing.bufferUsage',u=>{if(bufferUsage.length<64)bufferUsage.push(u);});
  completed=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.start',{traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:65536,
    includedCategories:categories,excludedCategories:['*']},transferMode:'ReturnAsStream',bufferUsageReportingInterval:1000});
  tracing=true;
  await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.resetTail();h.freeze(false);
    const m=window.__coreApproachTrace={frames:[],capacity:10000,dropped:0,start:performance.now(),last:null,active:true};
    performance.mark('voxarrium:core-approach-trace-start');
    const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<m.capacity)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}
      m.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  const started=Date.now(),deadline=started+45000;
  for(const target of route){
    if(Date.now()>=deadline)break;
    let running=true,arrived=false;await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    while(Date.now()<deadline){
      const distance=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();
        h.steer(Math.atan2(p.x-x,p.z-z),-.08);return Math.hypot(p.x-x,p.z-z);},target);
      if(distance<.55){arrived=true;break;}
      if(running&&distance<1.8){await page.keyboard.up('ShiftLeft');running=false;}
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    if(arrived)arrivals.push({target,elapsedMs:Date.now()-started});
  }
  if(Date.now()<deadline)await page.waitForTimeout(deadline-Date.now());
  const measurement=await page.evaluate(()=>{const m=window.__coreApproachTrace;m.active=false;
    const sorted=m.frames.map(f=>f.interval).filter(n=>n>0).sort((a,b)=>a-b),p=f=>sorted[Math.ceil(sorted.length*f)-1];
    return {startMs:m.start,endMs:performance.now(),samples:sorted.length,p50:p(.5),p95:p(.95),p99:p(.99),max:sorted.at(-1),
      frames:m.frames,dropped:m.dropped,final:window.__VOXARRIUM__.snapshot()};
  });
  await stopTrace();
  assert.equal(runtimeSourceSnapshot().sha256,source.sha256);assert.deepEqual(errors,[]);
  assert.deepEqual(measurement.final.streaming.errors,[]);assert.equal(measurement.final.state.resets,0);assert.equal(measurement.dropped,0);
  const report={browser:browser.version(),runtimeSourceSha256:source.sha256,headless:true,physicalMouseCapture:false,
    viewport:{width:1920,height:1080,dpr:1},scene:'m8',traceCategories:categories,bufferUsage,traceBufferKiB:65536,maximumTraceSeconds:45,
    traceStartMarker:'voxarrium:core-approach-trace-start',traceCompletion,route,arrivals,
    scope:'Natural Rural spawn with actual W/Shift and 80 ms yaw steering toward the first ten core waypoints, capped at 45 seconds. No bookmark, teleport, fixed stepping, reload or physical mouse capture. External owner workloads are uncontrolled. Tracing adds overhead; excludes acceptance cadence, GPU execution and OS scheduling attribution.',
    baseline,...measurement,errors};
  write('diagnostic.json',report);
  console.log(JSON.stringify({directory,source:source.sha256,samples:measurement.samples,max:measurement.max,p99:measurement.p99,arrivals:arrivals.length,errors}));
}catch(error){write('failure.json',{error:String(error),errors,bufferUsage,snapshot:await page.evaluate(()=>window.__VOXARRIUM__?.snapshot()).catch(()=>null)});throw error;}
finally{await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});
  if(tracing)await stopTrace().catch(()=>{});await context.close();await browser.close();}
