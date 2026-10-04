import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import type {Vec3} from '../src/simulation/types';
import {runtimeSourceSnapshot} from '../tools/runtime-source-snapshot.mjs';

const directory=process.env.VOXARRIUM_CORE_EVIDENCE??'artifacts/m8/browser';mkdirSync(directory,{recursive:true});
const write=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}`,JSON.stringify(value,null,2)+'\n');
async function walk(page:Page,target:Vec3){
  return page.evaluate(async target=>{
    const h=window.__VOXARRIUM__!;let frames=0;
    for(;frames<6000;frames+=6){const p=h.position(),d=Math.hypot(p.x-target.x,p.z-target.z);if(d<.3)break;
      h.steer(Math.atan2(p.x-target.x,p.z-target.z),-.08);const stepped=h.step(6,{forward:d<.8?Math.min(1,d*1.7):1,run:d>1.5});
      if(stepped.paused)throw new Error(`Fixed-step browser lost activity: ${JSON.stringify({target,position:stepped.player.position,focused:document.hasFocus(),visibility:document.visibilityState,pointerLocked:document.pointerLockElement?.id==='world'})}`);
      await h.settleStreaming();}
    h.step(30);await h.settleStreaming();const s=h.snapshot();
    return {target,frames,position:s.state.player.position,grounded:s.state.player.grounded,resets:s.state.resets,
      loaded:s.streaming!.loadedIds,active:s.streaming!.activeIds,errors:s.streaming!.errors,npcs:s.npcTiers,physics:s.physics,
      environment:s.state.environment,audio:s.audio,resources:s.render.streamingResources};
  },target);
}
for(const backend of ['WebGPU','WebGL2'] as const)test(`M8 ${backend} continuous seven-ward routes, shared environment, tiers and evidence`,async({page})=>{
  test.setTimeout(1200000);const errors:string[]=[],arrivals:unknown[]=[],states:Record<string,unknown>={};
  const source=runtimeSourceSnapshot();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/?scene=m8&test=1&diagnostics=tail${backend==='WebGL2'?'&backend=webgl':''}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready','true',{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.freeze(true);h.pause(false);});
  const initial=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
  expect(initial.facts.backend).toBe(backend);expect(initial.city!.coreIds).toHaveLength(7);expect(initial.npcTiers.uniqueIds).toBe(152);
  const ids=initial.state.population.map(n=>n.id);
  for(let cycle=0;cycle<(backend==='WebGPU'?2:1);cycle++){
    await page.evaluate(cycle=>{const h=window.__VOXARRIUM__!;h.mode(cycle?'first-person':'third-person');h.environment(cycle?'rain':'clear',cycle?'dusk':'day',true);},cycle);
    for(const [waypoint,target] of initial.city!.route.slice(1).entries()){
      const result=await walk(page,target);arrivals.push({cycle,waypoint,...result});
      if(waypoint%20===0){write(`${backend}-progress.json`,{cycle,waypoint,arrivals,errors});console.log(`${backend} cycle ${cycle+1}, waypoint ${waypoint+1}/${initial.city!.route.length-1}`);}
      expect(result.frames,JSON.stringify(result)).toBeLessThan(6000);expect(result.grounded).toBe(true);expect(result.resets).toBe(0);
      expect(result.loaded.length).toBeLessThanOrEqual(2);expect(result.errors).toEqual([]);expect(result.npcs.uniqueIds).toBe(152);
      expect(result.environment!.weather).toBe(cycle?'rain':'clear');expect(result.environment!.timeOfDay).toBe(cycle?'dusk':'day');
      expect(result.audio.activeLoops).toBe(5);expect(result.audio.activeVoices).toBeLessThanOrEqual(5);
      for(const d of initial.city!.districts)expect(!!result.physics.areas[d.id]).toBe(result.active.includes(d.id));
      expect(result.resources!.cache!.entries).toBeLessThanOrEqual(result.resources!.cache!.capacity);
    }
    const s=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());expect(s.state.population.map(n=>n.id)).toEqual(ids);
    write(`${backend}-cycle-${cycle}.json`,s);
  }
  write(`${backend}-traversal.json`,{scope:'Natural-spawn continuous whole-core route with fixed-step ordinary controller and real staged preparation; no cadence claim. WebGPU repeats in third-person clear/day and first-person rain/dusk. Explicit WebGL2 fallback uses the whole route.',arrivals,errors});
  if(backend==='WebGPU'){
    await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair{visibility:hidden}'});
    await page.evaluate(()=>document.body.classList.add('review'));
    const capture=async(name:string)=>{
      // Timing has separate complete route reports. Repeating its large
      // ledger in every view also bloats Playwright traces and can exceed
      // JavaScript's aggregate string limit during the manifest export.
      const s=await page.evaluate(()=>{const {tail,...visual}=window.__VOXARRIUM__!.snapshot();return visual;});
      expect(Buffer.byteLength(JSON.stringify(s),'utf8'),`${name} visual metadata size`).toBeLessThan(4*1024*1024);
      expect(s.state.resets,name).toBe(0);expect(s.state.player.grounded,name).toBe(true);
      states[name]=s;await page.screenshot({path:`${directory}/${name}.png`});
    };
    for(const d of initial.city!.urban.filter(d=>d.namespace==='m8')){
      for(const [name,view] of Object.entries(d.views)){
        await page.evaluate(async({d,name,view})=>{const h=window.__VOXARRIUM__!;h.bookmark(`${d.namespace}.${d.id}.${name}`,name==='street'||name==='hero'?'third-person':'first-person');
          h.look(view.yaw,view.pitch);h.environment('clear','day',true);h.step(180);await h.settleStreaming();},{d,name,view});
        const active=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot().streaming!.activeIds);
        expect(active).toContain(d.id);await capture(`${d.id}-${name}`);
      }
      await page.evaluate(id=>window.__VOXARRIUM__!.cityCamera(`m8-${id}`),d.id);await capture(`${d.id}-eagle-eye`);
    }
    await page.evaluate(async()=>{const h=window.__VOXARRIUM__!;h.bookmark('m7.lower-canal.quay','first-person');h.step(180);await h.settleStreaming();h.environment('clear','day',true);});await capture('first-person-waterfront');
    for(const [weather,time,name] of [['clear','day','city-core-eagle-eye'],['clear','night','city-core-night'],['rain','dusk','city-core-rain']] as const){
      await page.evaluate(({weather,time})=>{const h=window.__VOXARRIUM__!;h.environment(weather,time,true);h.cityCamera('city-core');},{weather,time});await capture(name);
    }
    await page.evaluate(()=>{
      document.body.classList.remove('review');const h=window.__VOXARRIUM__!;h.cityDebug('districts');const s=h.snapshot();
      const panel=document.createElement('pre');panel.id='core-residency-review';
      panel.style.cssText='position:fixed;left:20px;top:82px;max-width:440px;padding:18px;background:#142327ed;color:#eee4cc;font:13px/1.55 monospace;z-index:40;white-space:pre-wrap';
      panel.textContent='M8 LIVE RESIDENCY\nResident: macro terrain, roads, water, landmarks\n'+s.city!.coreIds.map(id=>
        `${id}: ${s.streaming!.activeIds.includes(id)?'active detail':s.streaming!.loadedIds.includes(id)?'prepared detail':'resident coarse'}`).join('\n')+
        `\nLoaded leases ${s.streaming!.loadedIds.length}/2\nNPC full/reduced/data ${Object.values(s.npcTiers.counts).join('/')}\n${s.npcTiers.uniqueIds} unique persistent identities\nCache ${s.render.streamingResources!.cache!.entries}/${s.render.streamingResources!.cache!.capacity}`;
      document.body.append(panel);
    });await capture('city-core-loaded-resident-debug');
    write('capture-states.json',{sourceSha256:source.sha256,scope:'Explicit fixed-condition view bookmarks after continuous route proof. Camera/player/environment/NPC/streaming/render/resource state is retained for every capture; diagnostic tail ledgers are omitted from visual metadata and preserved separately in complete route/cadence reports. Each view metadata record is bounded to4MiB. Overview uses coarse production silhouettes for unloaded districts.',states,errors});
  }
  expect(runtimeSourceSnapshot().sha256).toBe(source.sha256);
  expect(errors).toEqual([]);
});
