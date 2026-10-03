import { test,expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import type { Vec3 } from '../src/simulation/types';

const directory=process.env.VOXARRIUM_URBAN_EVIDENCE??'artifacts/m7/browser';mkdirSync(directory,{recursive:true});
const write=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}`,JSON.stringify(value,null,2)+'\n');
async function ready(page:Page,backend=''){
  await page.goto(`/?scene=m7&test=1&diagnostics=tail${backend}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready','true',{timeout:120_000});
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.pause(false);h.freeze(true);h.environment('clear','day',true);});
}
async function walk(page:Page,target:Vec3){
  return page.evaluate(async target=>{
    const h=window.__VOXARRIUM__!;let frames=0;
    for(;frames<6000;frames+=6){const p=h.position(),d=Math.hypot(p.x-target.x,p.z-target.z);if(d<.3)break;
      h.steer(Math.atan2(p.x-target.x,p.z-target.z),-.08);h.step(6,{forward:d<.8?Math.min(1,d*1.7):1,run:d>1.5});await h.settleStreaming();}
    h.step(30);await h.settleStreaming();const s=h.snapshot();
    return {target,frames,position:s.state.player.position,grounded:s.state.player.grounded,resets:s.state.resets,
      loaded:s.streaming!.loadedIds,active:s.streaming!.activeIds,errors:s.streaming!.errors,npcs:s.npcTiers,physics:s.physics};
  },target);
}
test('M7 captures both distinct districts and continuous accepted-to-production traversal',async({page})=>{
  test.setTimeout(720_000);const errors:string[]=[],states:Record<string,unknown>={},arrivals:unknown[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await ready(page);const initial=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());expect(initial.facts.backend).toBe('WebGPU');
  expect(initial.npcTiers.uniqueIds).toBeGreaterThan(80);
  await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair{visibility:hidden}'});
  async function capture(name:string){
    const s=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
    expect(s.state.resets,`${name} capture reset`).toBe(0);expect(s.state.player.grounded,`${name} capture grounded`).toBe(true);
    const district=initial.city!.urban.find(d=>name.startsWith(d.id));
    if(district)expect(s.streaming!.activeIds,`${name} capture residency`).toContain(district.id);
    states[name]=s;await page.screenshot({path:`${directory}/${name}.png`});
  }
  const end=initial.city!.route.findIndex(p=>p.x===110&&p.z===-235);
  expect(end).toBeGreaterThan(10);
  for(const target of initial.city!.route.slice(1,end+1)){
    const result=await walk(page,target);arrivals.push(result);expect(result.frames,JSON.stringify(result)).toBeLessThan(6000);
    expect(result.grounded).toBe(true);expect(result.resets).toBe(0);expect(result.errors).toEqual([]);expect(result.loaded.length).toBeLessThanOrEqual(2);
    if(target.x===145&&target.z===-10)await capture('accepted-river-market-transition');
  }
  await capture('central-market-arrival');
  for(const district of initial.city!.urban){
    if(district.id==='lower-canal'){
      for(const target of [{x:175,y:12,z:-235},{x:215,y:12,z:-225},{x:260,y:12,z:-225},{x:315,y:4,z:-215},{x:310,y:4,z:-165}]){
        const result=await walk(page,target);arrivals.push(result);expect(result.frames,JSON.stringify(result)).toBeLessThan(6000);expect(result.resets).toBe(0);expect(result.grounded).toBe(true);
      }
    }
    for(const target of district.route.slice(1)){const result=await walk(page,target);arrivals.push(result);
      expect(result.frames,JSON.stringify(result)).toBeLessThan(6000);expect(result.grounded).toBe(true);expect(result.resets).toBe(0);expect(result.loaded.length).toBeLessThanOrEqual(2);expect(result.errors).toEqual([]);}
    await page.evaluate(()=>document.body.classList.add('review'));
    await page.evaluate(id=>window.__VOXARRIUM__!.cityCamera(`m7-${id}`),district.id);await capture(`${district.id}-eagle-eye`);
    for(const [name,view] of Object.entries(district.views)){
      await page.evaluate(async({id,name,view})=>{const h=window.__VOXARRIUM__!;h.bookmark(`m7.${id}.${name}`,name==='alley'||name==='doorway'?'first-person':'third-person');
        h.look(view.yaw,view.pitch);h.step(120);await h.settleStreaming();h.environment('clear','day',true);}, {id:district.id,name,view});
      await capture(`${district.id}-${name}`);
    }
    for(const [weather,time] of [['clear','day'],['clear','night'],['rain','day']] as const){
      await page.evaluate(async({id,weather,time})=>{const h=window.__VOXARRIUM__!;h.bookmark(`m7.${id}.street`);h.environment(weather,time,true);h.step(240);await h.settleStreaming();}, {id:district.id,weather,time});
      await capture(`${district.id}-${weather==='rain'?'rain':time}`);
    }
    await page.evaluate(()=>{document.body.classList.remove('review');window.__VOXARRIUM__!.urbanDiagnostics(true);});await capture(`${district.id}-repetition-diagnostics`);
    await page.evaluate(()=>window.__VOXARRIUM__!.urbanDiagnostics(false));
    const snapshot=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
    expect(snapshot.streaming!.errors).toEqual([]);expect(snapshot.npcTiers.uniqueIds).toBe(initial.npcTiers.uniqueIds);
    expect(snapshot.render.streamingResources!.cache!.entries).toBeLessThanOrEqual(snapshot.render.streamingResources!.cache!.capacity);
  }
  write('capture-states.json',states);write('traversal.json',{scope:'Fixed-step ordinary physics, natural spawn to Central Market, connected bridge to Lower Canal and local district circuits. Capture bookmarks are separate view setup, not route proof or frame timing.',arrivals,errors});
  expect(errors).toEqual([]);
});

test('M7 explicit WebGL2 renders and traverses both production districts in first-person',async({page})=>{
  test.setTimeout(480_000);await ready(page,'&backend=webgl');const initial=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());expect(initial.facts.backend).toBe('WebGL2');
  const results=[];
  for(const d of initial.city!.urban){
    await page.evaluate(async id=>{const h=window.__VOXARRIUM__!;h.bookmark(`city.${id}`,'first-person');h.step(180);await h.settleStreaming();},d.id);
    const arrivals=[];
    for(const target of d.route.slice(1)){
      const arrival=await walk(page,target);expect(arrival.frames,JSON.stringify(arrival)).toBeLessThan(6000);
      expect(arrival.grounded).toBe(true);expect(arrival.resets).toBe(0);expect(arrival.errors).toEqual([]);arrivals.push(arrival);
    }
    await page.evaluate(async id=>{const h=window.__VOXARRIUM__!;h.bookmark(`m7.${id}.street`,'first-person');h.step(180);await h.settleStreaming();},d.id);
    const s=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
    expect(s.streaming!.activeIds).toContain(d.id);expect(s.streaming!.errors).toEqual([]);expect(s.state.player.grounded).toBe(true);
    results.push({district:d.id,arrivals,snapshot:s});await page.screenshot({path:`${directory}/${d.id}-webgl2-first-person.png`});
  }
  write('webgl2.json',{scope:'Explicit initialized WebGL2, complete local first-person circuits with fixed-step ordinary physics. One documented district-center setup per isolated circuit; no timing claim.',results});
});
