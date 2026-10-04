import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

const directory=process.env.VOXARRIUM_PRODUCTION_CAPTURE_DIR ?? 'artifacts/m5-1/production';
const scene=process.env.VOXARRIUM_PRODUCTION_SCENE;
const previewOrigin=process.env.VOXARRIUM_PRODUCTION_URL??'http://127.0.0.1:4173';
const city=scene==='m6'||scene==='m7'||scene==='m8';
const urban=scene==='m7'||scene==='m8';
mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({channel:process.env.VOXARRIUM_BROWSER ?? 'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
const source=runtimeSourceSnapshot();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const coordinates=text=>text.match(/XYZ\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/)?.slice(1).map(Number);
try {
  await page.goto(`${previewOrigin}/?test=1${city?`&scene=${scene}`:''}`);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:90000});
  assert.equal(await page.evaluate(()=>typeof window.__VOXARRIUM__),'undefined');
  if(city)assert.equal(await page.locator('#city-debug').count(),0);
  if(urban)assert.equal(await page.locator('#urban-repetition').count(),0);
  await page.locator('#start').click();
  await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  const before=coordinates(await page.locator('#diagnostics').innerText());
  await page.keyboard.down('KeyW');await page.waitForTimeout(1200);await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyV');await page.waitForTimeout(300);
  const afterText=await page.locator('#diagnostics').innerText(),after=coordinates(afterText);
  const moved=Math.hypot(after[0]-before[0],after[2]-before[2]);
  assert(moved>2);assert(afterText.includes(scene==='m8'?'m8-city-core':urban?'m7-urban-districts':city?'m6-city-blueprint':'m5-streaming-proof'));assert(afterText.includes('first-person'));
  await page.keyboard.press('Escape');
  await page.locator('#living-settings').evaluate(el=>{el.open=true;});
  await page.locator('#weather-select').selectOption('rain');await page.locator('#time-select').selectOption('night');
  await page.locator('#start').click();await page.waitForTimeout(4500);
  const finalDiagnostics=await page.locator('#diagnostics').innerText();
  assert(finalDiagnostics.includes(`night · rain · ${scene==='m8'?152:urban?94:42} locals`));assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>typeof window.__VOXARRIUM__),'undefined');
  await page.screenshot({path:`${directory}/production-smoke.png`});
  assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  const report={measuredAt:new Date().toISOString(),sourceSha256:source.sha256,browserVersion:browser.version(),before,after,moved,
    scope:`Built ${scene==='m8'?'M8 core':urban?'M7 city':city?'M6 city':'default M5'} preview; actual W/V/Esc and menu rain/night, pointer lock, no development harness${city?' or development overlay controls':''}. Complete streaming traversal is separately tested in the development stress tool.`,
    backend:await page.locator('#backend-badge').innerText(),finalDiagnostics,errors};
  writeFileSync(`${directory}/production-smoke.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({moved,errors}));
}finally{await browser.close();}
