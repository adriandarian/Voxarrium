import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Vec3 } from '../src/simulation/types';

const directory=process.env.VOXARRIUM_CITY_EVIDENCE ?? 'artifacts/m6/browser'; mkdirSync(directory,{recursive:true});
const write=(name:string,value:unknown)=>writeFileSync(`${directory}/${name}`,JSON.stringify(value,null,2)+'\n');
async function ready(page:Page,backend='') {
  await page.goto(`/?scene=m6&test=1&diagnostics=tail${backend}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready','true',{timeout:100_000});
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.pause(false);h.freeze(true);h.environment('clear','day',true);});
}
async function walk(page:Page,target:Vec3) {
  return page.evaluate(async target=>{
    const h=window.__VOXARRIUM__!;
    let frames=0;
    for(;frames<6000;frames+=6) {
      const p=h.position(); if(Math.hypot(p.x-target.x,p.z-target.z)<.32)break;
      const distance=Math.hypot(p.x-target.x,p.z-target.z);
      h.steer(Math.atan2(p.x-target.x,p.z-target.z),-.08);h.step(6,{forward:1,run:distance>1.5});
      await h.settleStreaming();
    }
    h.step(30);await h.settleStreaming();
    const s=h.snapshot();
    return {frames,position:s.state.player.position,grounded:s.state.player.grounded,resets:s.state.resets,
      loaded:s.streaming!.loadedIds,active:s.streaming!.activeIds,errors:s.streaming!.errors,physics:s.physics,
      identities:s.npcTiers.uniqueIds,environment:s.state.environment};
  },target);
}
test.beforeEach(async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  (page as Page & {cityErrors:string[]}).cityErrors=errors;
});
test.afterEach(async({page})=>expect((page as Page & {cityErrors:string[]}).cityErrors).toEqual([]));

test('M6 captures the master blueprint and continuously climbs connected districts to the citadel',async({page})=>{
  test.setTimeout(480_000); await ready(page);
  const states:Record<string,unknown>={}, arrivals=[];
  async function capture(name:string) {states[name]=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());await page.screenshot({path:`${directory}/${name}.png`});}
  await page.setViewportSize({width:900,height:1500});
  const initial=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
  expect(initial.facts.backend).toBe('WebGPU'); expect(initial.streaming!.loadedIds.length).toBeLessThanOrEqual(2);
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.cityCamera(h.snapshot().city!.cameras[0]!.id);h.cityDebug('none');});
  await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair {visibility:hidden}'});
  await page.evaluate(()=>document.body.classList.add('review'));
  await capture('master-eagle-eye');
  await page.setViewportSize({width:1600,height:1800});
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.cityCamera('district-map');h.cityDebug('districts');});await capture('district-map');
  await page.setViewportSize({width:900,height:1500});
  await page.evaluate(()=>window.__VOXARRIUM__!.cityCamera('master-eagle'));
  await page.evaluate(()=>window.__VOXARRIUM__!.cityDebug('waterways'));await capture('waterway-network');
  await page.evaluate(()=>window.__VOXARRIUM__!.cityDebug('streaming'));await capture('streaming-graph');
  const cameras=initial.city!.cameras;
  for(const camera of cameras.slice(1)) {await page.evaluate(id=>{const h=window.__VOXARRIUM__!;h.cityDebug('none');h.cityCamera(id);},camera.id);await capture(camera.id==='district-map'?'district-map-camera':camera.id);}
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{document.body.classList.remove('review');const h=window.__VOXARRIUM__!;h.cityDebug('none');h.mode('third-person');});
  let streetViews=0;
  for(const [index,target] of initial.city!.route.slice(1).entries()) {
    const result=await walk(page,target);arrivals.push({index,target,...result});
    expect(result.frames,JSON.stringify({target,result})).toBeLessThan(6000);
    expect(Math.hypot(result.position.x-target.x,result.position.z-target.z)).toBeLessThan(.5);
    expect(result.grounded).toBe(true);expect(result.resets).toBe(0);expect(result.errors).toEqual([]);
    expect(result.loaded.length).toBeLessThanOrEqual(2);expect(result.identities).toBe(42);
    for(const id of result.active) expect(result.physics.areas[id]).toBeDefined();
    if((streetViews===0 && target.z < -200) || (streetViews===1 && target.z < -365) || (streetViews===2 && target.z < -545)) {
      await page.evaluate(index=>{const h=window.__VOXARRIUM__!;const p=h.position();h.mode('third-person');
        h.look(index===1?Math.atan2(p.x-280,p.z+405):Math.atan2(p.x-170,p.z+640),index===2?.3:.12);},streetViews);
      await capture(`street-${++streetViews}-third-person`);
      await page.evaluate(()=>window.__VOXARRIUM__!.mode('first-person'));await capture(`street-${streetViews}-first-person`);
      await page.evaluate(()=>window.__VOXARRIUM__!.mode('third-person'));
    }
  }
  expect(streetViews).toBe(3);
  expect(new Set(arrivals.flatMap(arrival=>arrival.active)).size).toBeGreaterThanOrEqual(7);
  const final=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
  expect(final.state.player.position.y).toBeGreaterThan(45);
  write('traversal.json',{scope:'Continuous Rapier fixed-step route from natural spawn, no waypoint teleports; not frame timing.',arrivals,final});
  write('capture-states.json',states);
});

test('M6 explicit WebGL2 shares the elevated road physics and debug controls stay development-only',async({page})=>{
  test.setTimeout(240_000); await ready(page,'&backend=webgl');
  const s=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());expect(s.facts.backend).toBe('WebGL2');
  await page.evaluate(()=>window.__VOXARRIUM__!.mode('first-person'));
  const route=s.city!.route;
  const arrivals=[];
  for(const target of route.slice(1)) {
    const result=await walk(page,target);arrivals.push(result);
    expect(result.frames).toBeLessThan(6000);expect(result.resets).toBe(0);expect(result.grounded).toBe(true);
    expect(result.loaded.length).toBeLessThanOrEqual(2);expect(result.errors).toEqual([]);
    expect(Math.hypot(result.position.x-target.x,result.position.z-target.z)).toBeLessThan(.5);
  }
  write('webgl2-traversal.json',{arrivals,final:await page.evaluate(()=>window.__VOXARRIUM__!.snapshot())});
  await page.screenshot({path:`${directory}/webgl2-first-person.png`});
});
