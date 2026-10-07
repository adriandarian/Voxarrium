import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';
const directory=process.env.VOXARRIUM_UPPER_EVIDENCE??'artifacts/m9/review-initial';
assert(!existsSync(directory),'Preserve existing review evidence; set VOXARRIUM_UPPER_EVIDENCE to a fresh directory.');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),errors=[],states={};
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
try{
  await page.goto('http://127.0.0.1:5173/?scene=m9&test=1',{timeout:180000});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:180000});
  await page.locator('#start').click();await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.freeze(true);h.pause(false);});
  await page.addStyleTag({content:'.identity,.hud-bottom,#diagnostics,#backend-badge,#crosshair{visibility:hidden}'});
  const initial=await page.evaluate(()=>window.__VOXARRIUM__.snapshot());assert.equal(initial.facts.backend,'WebGPU');
  const capture=async(name)=>{
    const s=await page.evaluate(()=>{const{tail,...s}=window.__VOXARRIUM__.snapshot();return s;});
    assert.equal(s.state.player.grounded,true,name);assert.equal(s.state.resets,0,name);assert.deepEqual(s.streaming.errors,[]);
    states[name]=s;await page.screenshot({path:resolve(directory,`${name}.png`)});write('capture-states.json',{sourceSha256:source.sha256,browser:browser.version(),toolSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),viewSelection:process.env.VOXARRIUM_UPPER_VIEWS?.split(',')??'Original thirty-one views',viewportScope:'Gameplay1440x900/DPR1; canonical eagle900x1500/DPR1.',scope:'Explicit supported stationary inspections, separate from actual-input continuity/cadence. River detail warms from the resident handoff before its interior bookmark. Optional pavilion inspections use the unchanged grounded court/side/back bookmarks in first-person, looking at world(185,100,-631.8); original view directions/cameras/FOV are preserved for all default views.',states,errors});
    console.log(name);
  };
  for(const d of initial.city.urban.filter(d=>d.namespace==='m9')){
    if(process.env.VOXARRIUM_UPPER_VIEWS&&!Object.keys(d.views).some(name=>process.env.VOXARRIUM_UPPER_VIEWS.split(',').includes(`${d.id}-${name}`)))continue;
    await page.evaluate(async d=>{const h=window.__VOXARRIUM__,name=d.views.street?'street':'court';
      h.bookmark(`m9.${d.id}.${name}`,'third-person');await h.settleStreaming();h.step(180);await h.settleStreaming();h.step(60);},d);
    for(const [name,v] of Object.entries(d.views)){
      if(process.env.VOXARRIUM_UPPER_VIEWS&&!process.env.VOXARRIUM_UPPER_VIEWS.split(',').includes(`${d.id}-${name}`))continue;
      await page.evaluate(async({d,name,v})=>{const h=window.__VOXARRIUM__;h.bookmark(`m9.${d.id}.${name}`,name==='approach'||name==='street'?'third-person':'first-person');
        h.look(v.yaw,v.pitch);h.environment('clear','day',true);await h.settleStreaming();h.step(120);await h.settleStreaming();h.step(60);},{d,name,v});
      await capture(`${d.id}-${name}`);
    }
    if(!process.env.VOXARRIUM_UPPER_VIEWS){
      await page.evaluate(id=>window.__VOXARRIUM__.cityCamera(`m9-${id}`),d.id);await capture(`${d.id}-eagle-eye`);
    }
  }
  // Additional roof-architecture inspections are opt-in. Original gameplay
  // bookmarks, view directions and the canonical thirty-one defaults remain.
  for(const view of [
    {name:'citadel-pavilion-court',bookmark:'court'},
    {name:'citadel-pavilion-side',bookmark:'side'},
    {name:'citadel-pavilion-back',bookmark:'back'},
  ]){
    if(!process.env.VOXARRIUM_UPPER_VIEWS?.split(',').includes(view.name))continue;
    await page.evaluate(async view=>{
      const h=window.__VOXARRIUM__;h.bookmark(`m9.citadel.${view.bookmark}`,'first-person');
      await h.settleStreaming();h.step(120);await h.settleStreaming();h.step(60);
      const p=h.position(),target={x:185,y:100,z:-631.8};
      h.look(Math.atan2(p.x-target.x,p.z-target.z),
        Math.atan2(target.y-p.y-1.62,Math.hypot(p.x-target.x,p.z-target.z)));
      h.environment('clear','day',true);h.step(60);
    },view);
    await capture(view.name);
  }
  if(!process.env.VOXARRIUM_UPPER_VIEWS){
    for(const id of ['river-market','central-market','lower-canal','civic-terrace','upper-city']){
      if(id==='river-market'){
        const warm=await page.evaluate(async()=>{const h=window.__VOXARRIUM__;
          h.teleport({x:52,y:4.04,z:-10});h.look(-Math.PI/2,0);h.step(240);await h.settleStreaming();h.step(30);
          return h.snapshot().streaming.activeIds.includes('river-market');});assert.equal(warm,true);
      }
      await page.evaluate(async id=>{const h=window.__VOXARRIUM__;h.bookmark(`city.${id}`,'third-person');const p=h.position();
        h.look(Math.atan2(p.x-185,p.z+638),Math.atan2(93-p.y,Math.hypot(p.x-185,p.z+638)));h.environment('clear','day',true);await h.settleStreaming();h.step(120);await h.settleStreaming();h.step(60);},id);
      await capture(`citadel-from-${id}`);
    }
    for(const id of ['citadel','upper-city']){
      await page.evaluate(async id=>{const h=window.__VOXARRIUM__;h.bookmark(`m9.${id}.${id==='citadel'?'approach':'street'}`,'third-person');await h.settleStreaming();h.step(120);await h.settleStreaming();h.step(60);},id);
      for(const [weather,time,name] of [['clear','night',`${id}-night`],['rain','dusk',`${id}-rain`]]){
        await page.evaluate(({weather,time})=>{const h=window.__VOXARRIUM__;h.environment(weather,time,true);h.step(180);},{weather,time});await capture(name);
      }
    }
  }
  await page.setViewportSize({width:900,height:1500});await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.environment('clear','day',true);h.cityCamera('master-eagle');});await capture('master-eagle-eye');
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
}catch(error){write('failure.json',{error:String(error),errors,sourceSha256:source.sha256,states});throw error;}
finally{await browser.close();}
