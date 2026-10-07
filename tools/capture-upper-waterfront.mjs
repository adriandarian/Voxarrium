import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Supported inspection setups, separate from all native cadence windows.
const directory=process.env.VOXARRIUM_WATERFRONT_DIR??'artifacts/m9/waterfront-final';
assert(!existsSync(directory),'Preserve existing waterfront evidence; set VOXARRIUM_WATERFRONT_DIR to a fresh directory.');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),states={},errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const write=(name,data)=>writeFileSync(resolve(directory,name),JSON.stringify(data,null,2)+'\n');
try{
  await page.goto('http://127.0.0.1:5173/?scene=m9&test=1');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.addStyleTag({content:'.identity,.hud-bottom,#diagnostics,#backend-badge,#crosshair{visibility:hidden}'});
  const deck=await page.evaluate(async()=>{
    const {createCityBlueprint}=await import('/src/simulation/city-blueprint.ts');
    const {createUpperCityDistricts}=await import('/src/simulation/upper-city.ts');
    return createUpperCityDistricts(createCityBlueprint()).find(d=>d.id==='temple-quarter').structures
      .find(b=>b.id.endsWith('.bank-service-ledge.2'));
  });
  assert(deck,'Actual authored service platform is required.');
  await page.evaluate(async()=>{const h=window.__VOXARRIUM__;
    h.bookmark('m9.temple-quarter.street','first-person');h.environment('clear','day',true);
    h.step(180);await h.settleStreaming();h.step(60);
  });
  for(const [index,name] of ['bank-service-landing','bank-service-rail'].entries()){
    await page.evaluate(async({deck,name})=>{const h=window.__VOXARRIUM__,y=deck.position.y+deck.size.y/2;
      const x=deck.position.x+(name==='bank-service-landing'?deck.size.x/2+1:0);
      h.teleport({x,y:y+.04,z:deck.position.z});h.mode('first-person');
      h.look(name==='bank-service-landing'?Math.PI/2:Math.atan2(x-245,deck.position.z+385),
        name==='bank-service-landing'?-.3:.03);
      h.step(120);await h.settleStreaming();h.step(60);
    },{deck,name});
    const s=await page.evaluate(()=>{const {tail,...s}=window.__VOXARRIUM__.snapshot();return s;});
    assert.equal(s.facts.backend,'WebGPU');assert.equal(s.state.player.grounded,true,name);
    // Each explicit teleport increments the existing reset counter once.
    assert.equal(s.state.resets,index+1,name);assert(s.streaming.activeIds.includes('temple-quarter'),name);
    assert.deepEqual(s.streaming.errors,[]);states[name]=s;
    await page.screenshot({path:resolve(directory,`${name}.png`)});
    write('partial-states.json',{sourceSha256:source.sha256,deck,states,errors});
  }
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  write('capture-states.json',{sourceSha256:source.sha256,browser:browser.version(),
    toolSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope:'Two first-person waterfront inspections at 1440x900/DPR1. Temple detail warms at its supported street before teleport to the exact authored deck and terrain entry used by the physical traversal regression. These stationary setups do not measure natural-route continuity or frame cadence.',
    deck,states,errors});
  console.log(JSON.stringify({directory,views:Object.keys(states),sourceSha256:source.sha256,errors}));
}catch(error){write('failure.json',{error:String(error),sourceSha256:source.sha256,states,errors});throw error;}
finally{await browser.close();}
