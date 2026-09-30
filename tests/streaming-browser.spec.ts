import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { createStreamingWorld } from '../src/simulation/streaming-world';
import type { Vec3 } from '../src/simulation/types';

const directory = 'artifacts/m5/browser';
mkdirSync(directory, { recursive: true });
const world = createStreamingWorld();
const records: Record<string, unknown> = {};
async function ready(page: Page, backend = '') {
  await page.goto(`/?test=1${backend}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
}
async function walk(page: Page, target: Vec3) {
  return page.evaluate(async target => {
    const h = window.__VOXARRIUM__!;
    let frames = 0;
    for (; frames < 2100; frames += 4) {
      const p = h.position();
      if (Math.hypot(p.x-target.x,p.z-target.z)<.24) break;
      h.steer(Math.atan2(p.x-target.x,p.z-target.z),-.08);
      h.step(4,{forward:1});
      await h.settleStreaming();
    }
    h.step(120); await h.settleStreaming();
    return {frames,...h.snapshot()};
  },target);
}
test.beforeEach(async ({page})=>{
  const errors: string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  (page as Page & { streamingErrors:string[] }).streamingErrors=errors;
});
test.afterEach(async ({page})=>expect((page as Page & { streamingErrors:string[] }).streamingErrors).toEqual([]));

test('M5 streamed circuits keep collision, identities, environment, audio and resource ownership stable', async ({page})=>{
  test.setTimeout(360_000);
  await ready(page);
  await page.locator('#start').click();
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.freeze(true);h.environment('rain','dusk',true);});
  // Visit an existing landmark, then prove its serializable state survives
  // complete rural/market unloads. Rain draws the gardener away from the gate.
  await page.evaluate(()=>window.__VOXARRIUM__!.step(3600));
  for(const target of [{x:5,y:4,z:-1},{x:5,y:4,z:2.8},{x:9,y:4,z:2.8}]) await walk(page,target);
  await page.evaluate(()=>window.__VOXARRIUM__!.interact());
  expect((await page.evaluate(()=>window.__VOXARRIUM__!.snapshot())).state.interaction?.id).toBe('landmark.herbs');
  await page.evaluate(()=>window.__VOXARRIUM__!.interact());
  for(const target of [{x:5,y:4,z:2.8},{x:5,y:4,z:-1},world.route[0]!]) await walk(page,target);
  const baseline=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
  expect(baseline.state.sceneId).toBe('m5-streaming-proof');
  expect(baseline.streaming!.loadedIds).toEqual(['rural']);
  expect(baseline.state.population).toHaveLength(42);
  const identities=baseline.state.population.map(n=>n.id);
  const endpoints=[];
  for(let cycle=0;cycle<3;cycle++) {
    for(const [index,target] of world.route.slice(1).entries()) {
      const result=await walk(page,target);
      expect(result.frames,JSON.stringify(target)).toBeLessThan(2100);
      expect(Math.hypot(result.state.player.position.x-target.x,result.state.player.position.z-target.z)).toBeLessThan(.35);
      expect(result.state.player.grounded).toBe(true);
      expect(result.state.player.position.y).toBeGreaterThan(3.97);
      expect(result.state.resets).toBe(0);
      expect(result.streaming!.errors).toEqual([]);
      expect(result.state.population.map(n=>n.id)).toEqual(identities);
      expect(result.npcTiers.uniqueIds).toBe(42);
      expect(result.state.persistentInteractables!['landmark.herbs']!.visits).toBe(1);
      expect(result.state.environment!.weather).toBe('rain');
      expect(result.state.environment!.timeOfDay).toBe('dusk');
      expect(result.state.environment!.time).toBeGreaterThan(baseline.state.environment!.time);
      expect(result.audio.activeLoops).toBe(5);
      for(const area of ['rural','river-market','neighbor-shell'])
        expect(!!result.physics.areas[area]).toBe(result.streaming!.activeIds.includes(area as 'rural'));
      if(target.x===206) {
        expect(result.streaming!.loadedIds).toEqual(['neighbor-shell']);
        expect(result.npcTiers.counts['unloaded-data']).toBe(42);
        expect(result.audio.districtEmitters!.enabled).toBe(0);
        expect(result.audio.levels.market).toBe(0);
        const still=await page.evaluate(()=>{window.__VOXARRIUM__!.step(600);return window.__VOXARRIUM__!.snapshot();});
        expect(still.state.population).toEqual(result.state.population);
        expect(still.state.environment!.time).toBeGreaterThan(result.state.environment!.time);
      }
      if(cycle===0 && [5,8,17].includes(index)) {
        const mode=index===8?'first-person':'third-person';
        await page.evaluate(mode=>window.__VOXARRIUM__!.mode(mode === 'first-person' ? 'first-person' : 'third-person'),mode);
        await page.screenshot({path:`${directory}/route-${index}-${mode}.png`});
        records[`route-${index}`]=result;
      }
    }
    const endpoint=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
    writeFileSync(`${directory}/cycle-${cycle}-resource-audit.json`,JSON.stringify({baseline,endpoint},null,2));
    expect(endpoint.streaming!.loadedIds).toEqual(['rural']);
    expect(endpoint.render.streamingResources!.render).toEqual(baseline.render.streamingResources!.render);
    expect(endpoint.render.streamingResources!.assets).toEqual(baseline.render.streamingResources!.assets);
    expect(endpoint.physics).toEqual(baseline.physics);
    expect(endpoint.render.geometries).toBe(baseline.render.geometries);
    expect(endpoint.render.textures).toBe(baseline.render.textures);
    expect(endpoint.render.visibleMaterials).toBe(baseline.render.visibleMaterials);
    expect(endpoint.render.textureEvents.filter(event=>event.event==='recreated' && event.area)).toEqual([]);
    for(const npc of endpoint.state.population)
      expect(npc.distanceTravelled).toBeGreaterThanOrEqual(baseline.state.population.find(original=>original.id===npc.id)!.distanceTravelled);
    expect(endpoint.render.living.environment!.areaHooks).toEqual(['rural']);
    expect(endpoint.render.living.environment!.windBatches).toBe(baseline.render.living.environment!.windBatches);
    endpoints.push(endpoint);
  }
  writeFileSync(`${directory}/circuits.json`,JSON.stringify({baseline,endpoints,records},null,2));
  await page.evaluate(()=>window.__VOXARRIUM__!.dispose());
  expect(await page.evaluate(()=>typeof window.__VOXARRIUM__)).toBe('undefined');
});

test('M5 initialized WebGL2 traverses the rural to market handoff without recovery',async({page})=>{
  test.setTimeout(180_000);await ready(page,'&backend=webgl');
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.pause(false);h.freeze(true);h.mode('first-person');});
  for(const target of world.route.slice(1,7)) {
    const result=await walk(page,target);
    expect(result.frames).toBeLessThan(2100);expect(result.state.resets).toBe(0);
    expect(result.state.player.grounded).toBe(true);expect(result.facts.backend).toBe('WebGL2');
  }
  const result=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
  writeFileSync(`${directory}/webgl2-handoff.json`,JSON.stringify(result,null,2));
  await page.screenshot({path:`${directory}/webgl2-market.png`});
});

test('M5 eagle-eye and gameplay captures show the bounded neighboring shell and live weather',async({page})=>{
  test.setTimeout(180_000);await ready(page);
  await page.evaluate(()=>{const h=window.__VOXARRIUM__!;h.pause(false);h.freeze(true);});
  const states:Record<string,unknown>={};
  for(const target of world.route.slice(1,10)) await walk(page,target);
  for(const mode of ['third-person','first-person','eagle-eye'] as const) {
    await page.evaluate(mode=>{const h=window.__VOXARRIUM__!;h.mode(mode);const p=h.position();h.look(Math.atan2(p.x-208,p.z+26),.07);h.environment('rain','dusk',true);h.step(120);},mode);
    states[mode]=await page.evaluate(()=>window.__VOXARRIUM__!.snapshot());
    await page.screenshot({path:`${directory}/shell-${mode}.png`});
  }
  writeFileSync(`${directory}/capture-states.json`,JSON.stringify(states,null,2));
});

test('M5 initial area failure is visible without an unhandled rejection or retry loop',async({page})=>{
  let requests=0;
  await page.route('**/assets/rural/cottage.glb',route=>{requests++;return route.fulfill({status:404,body:'Injected missing initial area asset'});});
  await page.goto('/?test=1');
  await expect(page.locator('html')).toHaveAttribute('data-ready','failed',{timeout:90000});
  await expect(page.locator('#fatal')).toContainText('Initial area failed');
  await page.waitForTimeout(1000);
  expect(requests).toBe(1);
  expect(await page.evaluate(()=>typeof window.__VOXARRIUM__)).toBe('undefined');
  const errors=(page as Page & {streamingErrors:string[]}).streamingErrors;
  expect(errors.length).toBeGreaterThan(0);
  for(const error of errors) expect(error).toMatch(/404|Initial area failed|Voxarrium startup\/runtime failure/);
  errors.length=0;
});
