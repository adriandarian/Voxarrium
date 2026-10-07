import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import type {Vec3} from '../src/simulation/types';
import {runtimeSourceSnapshot} from '../tools/runtime-source-snapshot.mjs';

const directory=process.env.VOXARRIUM_UPPER_EVIDENCE??'artifacts/m9/browser';mkdirSync(directory,{recursive:true});
const write=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}`,JSON.stringify(value,null,2)+'\n');
async function walk(page:Page,target:Vec3){
  return page.evaluate(async target=>{
    const h=window.__VOXARRIUM__!;let frames=0;
    for(;frames<6000;frames+=6){const p=h.position(),d=Math.hypot(p.x-target.x,p.z-target.z);if(d<.3)break;
      h.steer(Math.atan2(p.x-target.x,p.z-target.z),-.08);h.step(6,{forward:d<.8?Math.min(1,d*1.7):1,run:d>1.5});await h.settleStreaming();}
    h.step(30);await h.settleStreaming();const s=h.snapshot();
    return {target,frames,position:s.state.player.position,grounded:s.state.player.grounded,resets:s.state.resets,
      loaded:s.streaming!.loadedIds,active:s.streaming!.activeIds,errors:s.streaming!.errors,npcs:s.npcTiers,physics:s.physics,
      environment:s.state.environment,audio:s.audio,resources:s.render.streamingResources};
  },target);
}

for(const backend of ['WebGPU','WebGL2'] as const)test(`M9 ${backend} complete core/upper route and persistent systems`,async({page})=>{
  // The 5.33 km fallback passed in 31.3 minutes. The WebGPU deadline of 30
  // minutes interrupted circuit two after 227 saved, passing arrivals. Both
  // use 45 minutes; the 6000-step per-leg bound and every assertion remain.
  // Native frame/readiness/resource gates are separate and unchanged.
  test.setTimeout(45*60*1000);const errors:string[]=[],arrivals:unknown[]=[],states:Record<string,unknown>={};const source=runtimeSourceSnapshot();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/?scene=m9&test=1&diagnostics=tail${backend==='WebGL2'?'&backend=webgl':''}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready','true',{timeout:120000});await page.locator('#start').click();
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.freeze(true);h.pause(false);});
  const initial=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
  expect(initial.facts.backend).toBe(backend);expect(initial.city!.coreIds).toHaveLength(11);
  expect(initial.npcTiers.uniqueIds).toBe(224);expect(initial.state.population).toHaveLength(224);
  const ids=initial.state.population.map(n=>n.id);
  for(let cycle=0;cycle<(backend==='WebGPU'?2:1);cycle++){
    await page.evaluate(cycle=>{const h=window.__VOXARRIUM__!;h.mode(cycle?'first-person':'third-person');h.environment(cycle?'rain':'clear',cycle?'dusk':'day',true);},cycle);
    for(const [waypoint,target] of initial.city!.route.slice(1).entries()){
      const result=await walk(page,target);arrivals.push({cycle,waypoint,...result});
      if(waypoint%20===0){write(`${backend}-progress.json`,{cycle,waypoint,arrivals,errors});console.log(`${backend} M9 cycle ${cycle+1}, waypoint ${waypoint+1}/${initial.city!.route.length-1}`);}
      expect(result.frames,JSON.stringify(result)).toBeLessThan(6000);expect(result.grounded).toBe(true);expect(result.resets).toBe(0);
      expect(result.loaded.length).toBeLessThanOrEqual(2);expect(result.errors).toEqual([]);expect(result.npcs.uniqueIds).toBe(ids.length);
      expect(result.environment!.weather).toBe(cycle?'rain':'clear');expect(result.environment!.timeOfDay).toBe(cycle?'dusk':'day');
      expect(result.audio.activeLoops).toBe(5);expect(result.audio.activeVoices).toBeLessThanOrEqual(5);
      for(const d of initial.city!.districts)expect(!!result.physics.areas[d.id]).toBe(result.active.includes(d.id));
      expect(result.resources!.cache!.entries).toBeLessThanOrEqual(result.resources!.cache!.capacity);
    }
    const s=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());expect(s.state.population.map(n=>n.id)).toEqual(ids);write(`${backend}-cycle-${cycle}.json`,s);
  }
  write(`${backend}-traversal.json`,{sourceSha256:source.sha256,scope:'Natural-spawn full M8 core plus Noble/Upper/Citadel/Temple circuits; ordinary fixed-step controller and real staged preparation, separate from actual-input cadence.',arrivals,errors});
  if(backend==='WebGPU'){
    await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair{visibility:hidden}'});
    await page.evaluate(()=>document.body.classList.add('review'));
    const capture=async(name:string)=>{
      const s=await page.evaluate(()=>{const {tail,...visual}=window.__VOXARRIUM__!.snapshot();return visual;});
      expect(Buffer.byteLength(JSON.stringify(s),'utf8')).toBeLessThan(4*1024*1024);expect(s.state.resets,name).toBe(0);expect(s.state.player.grounded,name).toBe(true);
      states[name]=s;await page.screenshot({path:`${directory}/${name}.png`});
    };
    for(const d of initial.city!.urban.filter(d=>d.namespace==='m9')){
      await page.evaluate(async d=>{const h=window.__VOXARRIUM__!,name=d.views.street?'street':'court';
        h.bookmark(`m9.${d.id}.${name}`,'third-person');await h.settleStreaming();h.step(180);await h.settleStreaming();h.step(60);},d);
      for(const [name,view] of Object.entries(d.views)){
        await page.evaluate(async({d,name,view})=>{const h=window.__VOXARRIUM__!;h.bookmark(`m9.${d.id}.${name}`,name==='street'||name==='approach'?'third-person':'first-person');
          h.look(view.yaw,view.pitch);h.environment('clear','day',true);await h.settleStreaming();h.step(180);await h.settleStreaming();h.step(60);},{d,name,view});
        expect(await page.evaluate(()=>window.__VOXARRIUM__!.snapshot().streaming!.activeIds)).toContain(d.id);await capture(`${d.id}-${name}`);
      }
      await page.evaluate(id=>window.__VOXARRIUM__!.cityCamera(`m9-${id}`),d.id);await capture(`${d.id}-eagle-eye`);
    }
    // Fixed gameplay setup: lower skyline orientation remains visible as resident coarse context.
    for(const id of ['river-market','central-market','lower-canal','civic-terrace','upper-city']){
      if(id==='river-market'){
        // Accepted River ground belongs to its detail lease. Stage a distant
        // inspection jump on the existing resident handoff before bookmarking
        // the interior; full natural-spawn routes above never use this setup.
        const warm=await page.evaluate(async()=>{const h=window.__VOXARRIUM__!;
          h.teleport({x:52,y:4.04,z:-10});h.look(-Math.PI/2,0);h.step(240);await h.settleStreaming();h.step(30);
          return h.snapshot().streaming!.activeIds.includes('river-market');});
        expect(warm).toBe(true);
      }
      await page.evaluate(async id=>{const h=window.__VOXARRIUM__!;h.bookmark(`city.${id}`,'third-person');const p=h.position();
        h.look(Math.atan2(p.x-185,p.z+638),Math.atan2(93-p.y,Math.hypot(p.x-185,p.z+638)));h.environment('clear','day',true);await h.settleStreaming();h.step(120);await h.settleStreaming();h.step(60);},id);
      await capture(`citadel-from-${id}`);
    }
    for(const id of ['citadel','upper-city']){
      await page.evaluate(async id=>{const h=window.__VOXARRIUM__!;h.bookmark(`m9.${id}.${id==='citadel'?'approach':'street'}`,'third-person');await h.settleStreaming();h.step(120);await h.settleStreaming();h.step(60);},id);
      for(const [weather,time,name] of [['clear','night',`${id}-night`],['rain','dusk',`${id}-rain`]] as const){
        await page.evaluate(({weather,time})=>{const h=window.__VOXARRIUM__!;h.environment(weather,time,true);h.step(180);},{weather,time});await capture(name);
      }
    }
    await page.setViewportSize({width:900,height:1500});await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.environment('clear','day',true);h.cityCamera('master-eagle');});await capture('master-eagle-eye');
    write('capture-states.json',{sourceSha256:source.sha256,browser:page.context().browser()!.version(),viewportScope:'Gameplay1440x900/DPR1; canonical eagle900x1500/DPR1.',
      scope:'Explicit inspection setups are separate from continuous traversal. River Market inspection first stages on the existing resident handoff because accepted ground belongs to its area lease, then establishes the interior bookmark. Overview retains at most two detailed wards and resident coarse architecture elsewhere.',states,errors});
  }
  expect(runtimeSourceSnapshot().sha256).toBe(source.sha256);expect(errors).toEqual([]);
});
