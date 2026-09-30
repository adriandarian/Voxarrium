import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const directory=process.env.VOXARRIUM_DISTRICT_CAPTURE_DIR ?? 'artifacts/m4/final';
mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({channel:process.env.VOXARRIUM_BROWSER ?? 'chrome',headless:false});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const coordinates=text=>text.match(/XYZ\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/)?.slice(1).map(Number);
try{
  await page.goto('http://127.0.0.1:4173/?test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:60000});
  assert.equal(await page.evaluate(()=>typeof window.__VOXARRIUM__),'undefined');
  await page.locator('#start').click();
  await page.waitForFunction(()=>document.pointerLockElement?.id==='world');
  const beforeText=await page.locator('#diagnostics').innerText(),before=coordinates(beforeText);
  await page.keyboard.down('KeyW');await page.waitForTimeout(1200);await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyV');await page.waitForTimeout(300);
  const afterText=await page.locator('#diagnostics').innerText(),after=coordinates(afterText);
  const moved=Math.hypot(after[0]-before[0],after[2]-before[2]);
  assert(moved>2);assert(afterText.includes('m4-market-district'));assert(afterText.includes('first-person'));assert(afterText.includes('42 locals'));
  await page.keyboard.press('Escape');
  await page.locator('#living-settings').evaluate(el=>{el.open=true;});
  await page.locator('#weather-select').selectOption('rain');await page.locator('#time-select').selectOption('night');
  await page.locator('#start').click();await page.waitForTimeout(4500);
  const finalDiagnostics=await page.locator('#diagnostics').innerText();
  assert(finalDiagnostics.includes('night · rain · 42 locals'));assert.equal(await page.evaluate(()=>typeof window.__VOXARRIUM__),'undefined');assert.deepEqual(errors,[]);
  await page.screenshot({path:`${directory}/production-smoke.png`});
  const report={measuredAt:new Date().toISOString(),browserVersion:browser.version(),scope:'Built Vite preview; actual W/V/Esc and menu rain/night controls, production has no development harness.',
    before,after,moved,backend:await page.locator('#backend-badge').innerText(),finalDiagnostics,errors};
  writeFileSync(`${directory}/production-smoke.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({moved,errors}));
}finally{await browser.close();}
