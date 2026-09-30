import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Explicit one-minute experiment; no background loop, renderer flags or provider.
const directory = process.env.VOXARRIUM_DISTRICT_CAPTURE_DIR ?? 'artifacts/m4/performance';
const weather = process.env.VOXARRIUM_WEATHER ?? 'clear';
const light = process.env.VOXARRIUM_LIGHT ?? 'day';
const traceEnabled = process.env.VOXARRIUM_TRACE === '1';
if (!['clear','cloudy','rain'].includes(weather) || !['day','dusk','night'].includes(light)) throw new Error('Invalid measurement preset');
mkdirSync(directory,{recursive:true});
const browser = await chromium.launch({channel:process.env.VOXARRIUM_BROWSER ?? 'chrome',headless:false});
const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page = await context.newPage();
const errors = [];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const route = [[89,-12],[89,-28],[112,-28],[130,-28],[129,-6],[129,0],[129,9.9],[129,29],[96,29],[96,9.9],[96,0],[89,-12]];
let cdp, tracingComplete;
try {
  await page.goto('http://127.0.0.1:5173/?test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:60000});
  await page.locator('#start').click();
  await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  await page.evaluate(({weather,light})=>{
    const h=window.__VOXARRIUM__;h.bookmark('market');h.environment(weather,light,true);h.freeze(false);
  },{weather,light});
  await page.waitForTimeout(3000);
  if(traceEnabled){
    cdp=await context.newCDPSession(page);
    tracingComplete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
    await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.gc,blink.user_timing',options:'record-as-much-as-possible',transferMode:'ReturnAsStream'});
  }
  await page.evaluate(()=>{
    const m=window.__districtMeasure={frames:[],start:performance.now(),last:performance.now(),active:true};
    const sample=now=>{if(!m.active)return;m.frames.push({time:now,interval:now-m.last});m.last=now;requestAnimationFrame(sample);};
    requestAnimationFrame(sample);
  });
  const started=Date.now();let waypoint=1,nextSample=0;
  const checkpoints=[];
  await page.keyboard.down('KeyW');
  while(Date.now()-started<60000){
    const target=route[Math.min(waypoint,route.length-1)];
    const result=await page.evaluate(([x,z])=>{
      const h=window.__VOXARRIUM__,snapshot=h.snapshot(),p=snapshot.state.player.position;
      h.look(Math.atan2(p.x-x,p.z-z),-.09);
      return {distance:Math.hypot(p.x-x,p.z-z),snapshot};
    },target);
    if(result.distance<.45&&waypoint<route.length-1)waypoint++;
    if(Date.now()-started>=nextSample){checkpoints.push({elapsedMs:Date.now()-started,waypoint,...result.snapshot});nextSample+=5000;}
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  const measurement=await page.evaluate(()=>{
    const m=window.__districtMeasure;m.active=false;
    const sorted=m.frames.map(f=>f.interval).filter(n=>n>0).sort((a,b)=>a-b);
    const mean=sorted.reduce((a,b)=>a+b,0)/sorted.length;
    const percentile=p=>sorted[Math.ceil(sorted.length*p)-1];
    return {durationMs:performance.now()-m.start,samples:sorted.length,meanFrameMs:mean,fps:1000/mean,
      medianFrameMs:percentile(.5),p95FrameMs:percentile(.95),p99FrameMs:percentile(.99),maxFrameMs:sorted.at(-1),
      framesOver33ms:sorted.filter(n=>n>33.3).length,longFrames:m.frames.filter(f=>f.interval>33.3),
      timeOrigin:performance.timeOrigin,jsHeap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null,
      final:window.__VOXARRIUM__.snapshot()};
  });
  if(cdp){
    await cdp.send('Tracing.end');const {stream}=await tracingComplete;
    const chunks=[];for(;;){const chunk=await cdp.send('IO.read',{handle:stream});chunks.push(chunk.base64Encoded?Buffer.from(chunk.data,'base64'):Buffer.from(chunk.data));if(chunk.eof)break;}
    await cdp.send('IO.close',{handle:stream});writeFileSync(`${directory}/browser-performance-trace.json`,Buffer.concat(chunks));
  }
  await page.screenshot({path:`${directory}/route-end.png`});
  const report={measuredAt:new Date().toISOString(),browserVersion:browser.version(),headed:true,traceEnabled,
    scope:'60-second actual W input with waypoint steering at 1920x1080/DPR1, after 3s warmup; rAF wall intervals including automation, not GPU time. Trace adds diagnostic overhead. JS heap is not VRAM.',
    environmentPreset:{weather,light},route,reachedWaypoint:waypoint,...measurement,checkpoints,errors};
  writeFileSync(`${directory}/performance-route-60s.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({durationMs:report.durationMs,fps:report.fps,p95FrameMs:report.p95FrameMs,maxFrameMs:report.maxFrameMs,framesOver33ms:report.framesOver33ms,reachedWaypoint:waypoint,errors}));
  if(errors.length||report.final.state.resets||report.final.state.paused||report.final.state.population.length!==42)throw new Error('Measurement encountered errors/reset/pause or lost population; inspect report');
}finally{await context.close();await browser.close();}
