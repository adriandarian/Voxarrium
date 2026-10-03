import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createWriteStream, mkdirSync, writeFileSync, readFileSync as fsRead } from 'node:fs';
import { runtimeSourceSnapshot } from './runtime-source-snapshot.mjs';
const runtimeSource=runtimeSourceSnapshot();
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { summarizeTransitions } from './streaming-transition-summary.mjs';

// One bounded natural-spawn M7 Central approach repeated once; second north-street leg traced for at most 45 s.
const weather=process.env.VOXARRIUM_WEATHER??'clear',light=process.env.VOXARRIUM_LIGHT??(weather==='rain'?'dusk':'day');
if(!['clear','rain'].includes(weather)||!['day','dusk'].includes(light))throw new Error('Invalid trace environment preset.');
const directory=resolve(process.env.VOXARRIUM_STREAMING_TRACE_DIR??`artifacts/m7/profiling/central-north-${weather}-${light}`);
mkdirSync(directory,{recursive:true});
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceStatus=execFileSync('git',['status','--short'],{encoding:'utf8'}).trim();
const browser=await chromium.launch({channel:process.env.VOXARRIUM_BROWSER??'chrome',headless:false});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],traceCategories=[],traceBufferUsage=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
let cdp,traceStarted=false,traceComplete,traceStartWallMs,traceStartPageMs,stoppedForLimit=false;
const originalRoute=JSON.parse(fsRead('artifacts/m7/stress/clear-day/route.json')).route;
const route=[...originalRoute.slice(0,43),...originalRoute.slice(17,43)];
const globalStart=Date.now();
async function stopTrace(){
  if(!traceStarted)return;
  await cdp.send('Tracing.end');traceStarted=false;
  const {stream}=await traceComplete;
  const output=createWriteStream(resolve(directory,'browser-performance-trace.json'));
  for(;;){const chunk=await cdp.send('IO.read',{handle:stream});const bytes=Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8');
    if(!output.write(bytes))await once(output,'drain');if(chunk.eof)break;}
  output.end();await once(output,'finish');await cdp.send('IO.close',{handle:stream});
}
try{
  cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  await page.goto('http://127.0.0.1:5173/?scene=m7&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  await page.evaluate(({weather,light})=>{window.__VOXARRIUM__.environment(weather,light,true);window.__VOXARRIUM__.freeze(false);},{weather,light});
  await page.waitForTimeout(3000);write('startup.json',await page.evaluate(()=>window.__VOXARRIUM__.snapshot()));
  const {categories}=await cdp.send('Tracing.getCategories');
  const available=new Set(categories.flatMap(group=>group.split(',')));
  const wanted=['devtools.timeline','v8','disabled-by-default-v8.gc','blink.user_timing','toplevel','gpu','gpu.dawn','disabled-by-default-gpu.dawn','renderer.scheduler'];
  traceCategories.push(...wanted.filter(category=>available.has(category)));
  // This Chrome build can expose an empty inventory until categories are enabled.
  // These exact tokens occur in the preserved same-host M5 native trace; an
  // explicit finite filter avoids the empty-filter browser-default trace trap.
  const sourceProven=['devtools.timeline','blink.user_timing','gpu','gpu.dawn'];
  for(const category of sourceProven)if(!traceCategories.includes(category))traceCategories.push(category);
  write('trace-category-inventory.json',{browserVersion:browser.version(),inventory:categories,selected:traceCategories,
    selectionSource:'Available inventory tokens plus exact tokens observed in artifacts/m5/phase-a/trace-clear/tail-findings.json; empty inventory never becomes an empty category filter.'});
  cdp.on('Tracing.bufferUsage',usage=>{if(traceBufferUsage.length<64)traceBufferUsage.push(usage);});
  for(const [index,target]of route.entries()){
    assert(Date.now()-globalStart<600000,'Bounded diagnostic exceeded ten minutes');
    if(index===43)await page.evaluate(()=>window.__VOXARRIUM__.mode('first-person'));
    if(index===50){
      traceComplete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      await cdp.send('Tracing.start',{traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:65536,includedCategories:traceCategories,excludedCategories:['*']},transferMode:'ReturnAsStream',bufferUsageReportingInterval:1000});
      traceStarted=true;traceStartWallMs=Date.now();
      traceStartPageMs=await page.evaluate(()=>{
        window.__VOXARRIUM__.resetTail();performance.mark('voxarrium:streaming-trace-start');
        const m=window.__streamTraceMeasure={frames:[],capacity:10000,dropped:0,start:performance.now(),last:null,active:true,
          traceAnchor:{name:'voxarrium:streaming-trace-start',startTime:performance.getEntriesByName('voxarrium:streaming-trace-start').at(-1).startTime}};
        const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<m.capacity)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}m.last=now;requestAnimationFrame(sample);};
        requestAnimationFrame(sample);return m.start;
      });
    }
    const legStart=Date.now();await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    for(;;){
      assert(Date.now()-legStart<35000,`Native trace route stalled waypoint ${index}`);
      const result=await page.evaluate(([x,z])=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-x,p.z-z),-.08);return{distance:Math.hypot(p.x-x,p.z-z),p};},target);
      if(result.distance<.55)break;
      if(traceStarted&&Date.now()-traceStartWallMs>45000){stoppedForLimit=true;await stopTrace();}
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    if(stoppedForLimit)break;
  }
  await page.waitForTimeout(2500);
  const measurement=await page.evaluate(()=>{
    const m=window.__streamTraceMeasure;if(!m)throw new Error('Trace sampling never began');m.active=false;
    const sorted=m.frames.map(frame=>frame.interval).filter(n=>n>0).sort((a,b)=>a-b),p=f=>sorted[Math.ceil(sorted.length*f)-1];
    return{startMs:m.start,endMs:performance.now(),durationMs:performance.now()-m.start,samples:sorted.length,
      medianFrameMs:p(.5),p95FrameMs:p(.95),p99FrameMs:p(.99),maxFrameMs:sorted.at(-1),framesOver33ms:sorted.filter(n=>n>33.3).length,
      frames:m.frames,longFrames:m.frames.filter(frame=>frame.interval>33.3),droppedFrames:m.dropped,traceAnchor:m.traceAnchor,
      visibility:document.visibilityState,focused:document.hasFocus(),final:window.__VOXARRIUM__.snapshot()};
  });
  await stopTrace();
  const transitions=summarizeTransitions(measurement.final.tail.transitions,measurement.frames,measurement.startMs,measurement.endMs);
  const market=transitions.reports.filter(report=>report.areaId==='central-market');
  assert.equal(runtimeSourceSnapshot().sha256,runtimeSource.sha256,'Runtime source changed during diagnostic');
  write('runtime-source.json',runtimeSource);
  const report={measuredAt:new Date().toISOString(),revision,sourceStatus,browserVersion:browser.version(),runtimeSourceSha256:runtimeSource.sha256,headed:true,scene:'m7',viewport:{width:1920,height:1080,dpr:1},
    environmentPreset:{weather,light},traceEnabled:true,traceCategories,traceBufferUsage,traceBufferKiB:65536,maximumTraceSeconds:45,stoppedForLimit,
    traceCoverage:{startPageMs:traceStartPageMs,marketRequestBeforeTrace:market.some(report=>report.requestAtMs<traceStartPageMs),
      maximumObservedBufferUsage:Math.max(0,...traceBufferUsage.map(row=>row.percentFull??0)),bufferFull:traceBufferUsage.some(row=>row.percentFull>=.99)},
    scope:'Bounded actual W+Shift natural rural approach and two Central circuits, switching to first person for the second. Native trace starts before the second northern service-street leg; 64 MiB trace buffer, 45 s trace cap and ten-minute diagnostic bound. This targeted diagnostic omits the intervening Canal circuit and is not a matched replacement for the complete stress run. Tracing adds overhead; rAF/native CPU spans are not GPU execution or OS scheduling proof.',
    route,...measurement,transitions,errors};
  write('performance-route-60s.json',report);write('transition-report.json',transitions);
  await page.screenshot({path:resolve(directory,'central-north-approach.png')});
  assert.deepEqual(errors,[]);assert.equal(measurement.droppedFrames,0);assert.equal(measurement.final.state.paused,false);assert.equal(measurement.final.state.resets,0);
  console.log(JSON.stringify({directory,samples:report.samples,max:report.maxFrameMs,p99:report.p99FrameMs,traceCategories,traceCoverage:report.traceCoverage,transitions:transitions.reports.map(({nativeAdjacentWallSpans,frameWindow,...transition})=>({...transition,frameWindow:{...frameWindow,longFrames:undefined}})),errors}));
}catch(error){write('failure.json',{error:String(error),errors,traceCategories,traceBufferUsage,snapshot:await page.evaluate(()=>window.__VOXARRIUM__?.snapshot()).catch(()=>null)});throw error;}
finally{
  await page.keyboard.up('KeyW').catch(()=>{});await page.keyboard.up('ShiftLeft').catch(()=>{});
  if(traceStarted)await stopTrace().catch(()=>{});
  await context.close();await browser.close();
}
