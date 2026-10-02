import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { summarizeTransitions } from './streaming-transition-summary.mjs';

// One bounded actual-keyboard city circuit. No teleports, bookmarks or manual steps.
const directory='artifacts/m6/stress';mkdirSync(directory,{recursive:true});
const write=(name,value)=>writeFileSync(`${directory}/${name}`,JSON.stringify(value,null,2)+'\n');
const browser=await chromium.launch({channel:'chrome',headless:false});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],arrivals=[],checkpoints=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto('http://127.0.0.1:5173/?scene=m6&test=1&diagnostics=tail');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:100000});
  const initial=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  const end=initial.city.route.findIndex(point=>point.z<=-235);
  assert(end>10,'Representative route must enter the central market.');
  const outward=initial.city.route.slice(1,end+1),route=[...outward,...outward.slice(0,-1).reverse(),initial.state.player.position];
  write('route.json',{route,scope:'Natural-spawn rural → market → workshop → south gate → garden → central market → rural; actual W+Shift, first-person on return.'});
  await page.bringToFront();await page.locator('#start').click();
  await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.environment('clear','day',true);h.freeze(false);h.resetTail();
    const m=window.__cityMeasure={active:true,start:performance.now(),last:null,frames:[],dropped:0};
    const sample=now=>{if(!m.active)return;if(m.last!==null){if(m.frames.length<60000)m.frames.push({time:now,interval:now-m.last});else m.dropped++;}m.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  const start=Date.now();let lastCheckpoint=0;
  for(const [index,target] of route.entries()) {
    if(index===outward.length)await page.evaluate(()=>window.__VOXARRIUM__.mode('first-person'));
    const legStart=Date.now();await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
    let running=true;
    for(;;) {
      assert(Date.now()-start<600000,'Bounded city circuit exceeded ten minutes.');
      assert(Date.now()-legStart<60000,`Navigation stalled at ${index}: ${JSON.stringify(target)}`);
      const result=await page.evaluate(target=>{const h=window.__VOXARRIUM__,p=h.position();h.steer(Math.atan2(p.x-target.x,p.z-target.z),-.08);return {distance:Math.hypot(p.x-target.x,p.z-target.z),p};},target);
      if(result.distance<.4)break;
      if(result.distance<1.8 && running){await page.keyboard.up('ShiftLeft');running=false;}
      if(Date.now()-start-lastCheckpoint>10000) {
        const s=await page.evaluate(()=>{const h=window.__VOXARRIUM__,s=h.snapshot();return {position:s.state.player.position,paused:s.state.paused,resets:s.state.resets,loaded:s.streaming.loadedIds,active:s.streaming.activeIds,errors:s.streaming.errors,physics:s.physics,identities:s.npcTiers.uniqueIds,cache:s.render.streamingResources.cache,focused:document.hasFocus(),visible:document.visibilityState,locked:document.pointerLockElement?.id==='world'};});
        assert.equal(s.paused,false);assert.equal(s.resets,0);assert.equal(s.focused,true);assert.equal(s.visible,'visible');assert.equal(s.locked,true);
        assert.equal(s.identities,42);assert(s.loaded.length<=2);assert.deepEqual(s.errors,[]);
        for(const id of s.active)assert(s.physics.areas[id]>0,`Missing active collision: ${id}`);
        checkpoints.push({elapsedMs:Date.now()-start,index,...s});lastCheckpoint=Date.now()-start;
        console.log(JSON.stringify({elapsedMs:lastCheckpoint,index,position:s.position,loaded:s.loaded}));
      }
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
    arrivals.push({index,target,position:await page.evaluate(()=>window.__VOXARRIUM__.position())});
  }
  await page.waitForTimeout(2300);
  const measurement=await page.evaluate(()=>{const m=window.__cityMeasure;m.active=false;const values=m.frames.map(f=>f.interval).sort((a,b)=>a-b);const p=n=>values[Math.ceil(values.length*n)-1];return {...m,end:performance.now(),samples:values.length,p50:p(.5),p95:p(.95),p99:p(.99),maximum:values.at(-1),over33:values.filter(v=>v>33.3).length};});
  const final=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
  assert.equal(final.state.resets,0);assert.equal(final.state.player.grounded,true);assert.deepEqual(final.streaming.errors,[]);assert.equal(measurement.dropped,0);assert.deepEqual(errors,[]);
  assert(final.streaming.loadedIds.includes('rural'));assert.equal(final.npcTiers.uniqueIds,42);
  const transitions=summarizeTransitions(final.tail.transitions,measurement.frames,measurement.start,measurement.end);
  write('actual-city-circuit.json',{measuredAt:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceStatus:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),browser:browser.version(),initial,final,arrivals,checkpoints,measurement,transitions,errors,
    limits:'One proxy-city circuit on this hardware; browser rAF/CPU wall time, not GPU execution or production-city performance. Macro terrain/water/landmarks stay resident; at most two detailed district leases. Boundary-needed records polygon proximity, while connector safety guards may wait earlier.'});
  await page.screenshot({path:`${directory}/returned-rural-first-person.png`});
  console.log(JSON.stringify({samples:measurement.samples,p95:measurement.p95,max:measurement.maximum,loaded:final.streaming.loadedIds,
    transitionMaximumMs:transitions.transitionSpecificMaximumMs,largestJobIncludingStartupMs:transitions.largestSchedulerJobMs,
    readyBeforeBoundaryNeeded:transitions.readyBeforeBoundaryNeeded,coverage:transitions.ledgerCoverage}));
} catch(error) {
  write('failure.json',{error:String(error),errors,arrivals,checkpoints});await page.screenshot({path:`${directory}/failure.png`}).catch(()=>{});throw error;
} finally {await browser.close();}
