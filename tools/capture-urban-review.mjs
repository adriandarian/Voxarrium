import { chromium } from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const directory=process.env.VOXARRIUM_URBAN_REVIEW??'artifacts/m7/review-initial';mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const states={},errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:5173/?scene=m7&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  const districts=await page.evaluate(()=>window.__VOXARRIUM__.snapshot().city.urban);
  await page.addStyleTag({content:'body.review .identity,body.review .hud-bottom,body.review #diagnostics,body.review #backend-badge,body.review #crosshair{visibility:hidden}'});
  await page.evaluate(()=>document.body.classList.add('review'));
  for(const d of districts){
    await page.evaluate(async id=>{const h=window.__VOXARRIUM__;h.freeze(true);h.bookmark(`m7.${id}.street`);h.step(180);await h.settleStreaming();},d.id);
    for(const [name,view] of Object.entries(d.views)){
      await page.evaluate(async({id,name,view})=>{const h=window.__VOXARRIUM__;h.bookmark(`m7.${id}.${name}`,['alley','doorway'].includes(name)?'first-person':'third-person');h.look(view.yaw,view.pitch);h.step(180);await h.settleStreaming();h.environment('clear','day',true);},{id:d.id,name,view});
      const state=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());
      assert.equal(state.state.resets,0,`${d.id}-${name} reset`);assert.equal(state.state.player.grounded,true,`${d.id}-${name} grounded`);
      assert(state.streaming.activeIds.includes(d.id),`${d.id}-${name} residency`);
      states[`${d.id}-${name}`]=state;await page.screenshot({path:`${directory}/${d.id}-${name}.png`});
    }
    await page.evaluate(id=>window.__VOXARRIUM__.cityCamera(`m7-${id}`),d.id);
    states[`${d.id}-eagle-eye`]=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());await page.screenshot({path:`${directory}/${d.id}-eagle-eye.png`});
  }
  writeFileSync(`${directory}/capture-states.json`,JSON.stringify({browser:browser.version(),scope:'Early fixed-condition art inspection with explicit view setup bookmarks; no traversal or performance claim.',states,errors},null,2)+'\n');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({directory,captures:Object.keys(states),errors}));
}catch(error){writeFileSync(`${directory}/failure.json`,JSON.stringify({error:String(error),errors},null,2));await page.screenshot({path:`${directory}/failure.png`});throw error;}finally{await browser.close();}
