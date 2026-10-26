import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Finite supported public inspection setups. Default, locally occluded views
// remain in the main evidence set; these supplement its lower-city audit.
const directory=process.env.VOXARRIUM_SIGHTLINE_DIR??'artifacts/m9/sightlines-final';
assert(!existsSync(directory),'Preserve existing sightline evidence; set VOXARRIUM_SIGHTLINE_DIR to a fresh directory.');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot(),states={},errors=[];
const firstPersonCases=[
  {name:'river-open-upper-lane',district:'river-market',publicSource:'upper-lane',position:{x:119.2,y:4.04,z:-27.4},target:{x:167,y:90,z:-628}},
  {name:'river-market-street',district:'river-market',position:{x:91,y:4.04,z:-12},target:{x:165,y:83,z:-634}},
  {name:'central-south-lane',district:'central-market',position:{x:102,y:12.04,z:-195},target:{x:165,y:83,z:-634}},
  {name:'central-bridge-approach',district:'central-market',position:{x:203.571,y:12.04,z:-227.857},target:{x:210,y:82,z:-620}},
  {name:'canal-wash-alley',district:'lower-canal',publicSource:'wash-alley',position:{x:246.093,y:4.04,z:-148.159},target:{x:167,y:90,z:-628}},
  {name:'canal-quay-turn',district:'lower-canal',position:{x:249.75,y:4.04,z:-155.75},target:{x:132,y:97,z:-638}},
  {name:'civic-north-square',district:'civic-terrace',position:{x:50,y:22.04,z:-357.857},target:{x:123,y:82,z:-625}},
  {name:'civic-retaining-lane',district:'civic-terrace',position:{x:45.385,y:22.04,z:-344.231},target:{x:123,y:82,z:-625}},
];
const cases=[...firstPersonCases.map(c=>({...c,mode:'first-person'})),
  ...firstPersonCases.filter(c=>['river-open-upper-lane','central-bridge-approach','canal-wash-alley','civic-north-square'].includes(c.name))
    .map(c=>({...c,name:`${c.name}-third-person`,mode:'third-person',lookYawOffsetRadians:c.name==='central-bridge-approach'?-.22:.22}))];
// Additional finite audit candidates require explicit selection. Keep the
// original twelve defaults, including ordinary occluded views, unchanged.
// South Gate's bridge is a connector toward Canal, not an interior Canal view.
const additionalFirstPersonCases=[
  {name:'river-market-gap-west',district:'river-market',publicSource:'market-link',position:{x:89,y:4.04,z:-12}},
  {name:'river-weavers-passage',district:'river-market',publicSource:'weavers-passage',position:{x:94,y:4.04,z:-28}},
  {name:'central-bridge-west',district:'central-market',publicSource:'exchange-river-bridge',position:{x:201.666666667,y:12.04,z:-228.333333333}},
  {name:'civic-west-square',district:'civic-terrace',publicSource:'civic-retaining-lane',position:{x:35,y:22.04,z:-320}},
  {name:'south-gate-canal-connector',district:'south-gate',publicSource:'lower-gate-bridge',classification:'Inside South Gate; connector toward Lower Canal',position:{x:273.75,y:4.04,z:-65}},
  {name:'south-gate-canal-connector-east',district:'south-gate',publicSource:'lower-gate-bridge',classification:'Inside South Gate; connector toward Lower Canal',position:{x:287.5,y:4.04,z:-65}},
].map(c=>({...c,target:{x:170,y:86,z:-635}}));
const additionalCases=[...additionalFirstPersonCases.map(c=>({...c,mode:'first-person'})),
  ...additionalFirstPersonCases.map(c=>({...c,name:`${c.name}-third-person`,mode:'third-person',
    lookYawOffsetRadians:c.district==='central-market'?-.22:.22}))];
const selectedCases=process.env.VOXARRIUM_SIGHTLINE_VIEWS
  ? [...cases,...additionalCases].filter(c=>process.env.VOXARRIUM_SIGHTLINE_VIEWS.split(',').includes(c.name))
  : cases;
assert(selectedCases.length>0,'Requested public sightline views do not exist.');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');
try{
  // HTTP entry transformation and module initialization precede the explicit
  // ready gate. Use the same finite setup budget, rather than the 30s default.
  await page.goto('http://127.0.0.1:5173/?scene=m9&test=1',{timeout:120000});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',undefined,{timeout:120000});
  await page.locator('#start').click();
  await page.evaluate(()=>{const h=window.__VOXARRIUM__;h.freeze(true);h.pause(false);});
  await page.addStyleTag({content:'.identity,.hud-bottom,#diagnostics,#backend-badge,#crosshair{visibility:hidden}'});
  for(const c of selectedCases){
    const setupResets=await page.evaluate(async c=>{
      const h=window.__VOXARRIUM__;
      if(c.district==='river-market'){
        h.teleport({x:52,y:4.04,z:-10});h.look(-Math.PI/2,0);
        h.step(240);await h.settleStreaming();h.step(30);
      }else{
        h.bookmark(`city.${c.district}`,'first-person');h.step(180);await h.settleStreaming();h.step(60);
      }
      const expectedResets=h.snapshot().state.resets+1;
      h.teleport(c.position);h.mode(c.mode);h.environment('clear','day',true);
      h.look(Math.atan2(c.position.x-c.target.x,c.position.z-c.target.z)+(c.lookYawOffsetRadians??0),
        Math.atan2(c.target.y-c.position.y-1.62,Math.hypot(c.position.x-c.target.x,c.position.z-c.target.z)));
      h.step(120);await h.settleStreaming();h.step(60);return expectedResets;
    },c);
    const s=await page.evaluate(()=>{const {tail,...s}=window.__VOXARRIUM__.snapshot();return s;});
    assert.equal(s.facts.backend,'WebGPU');assert.equal(s.state.player.grounded,true,c.name);
    assert(s.streaming.activeIds.includes(c.district),c.name);assert.deepEqual(s.streaming.errors,[]);
    assert(Math.hypot(s.state.player.position.x-c.position.x,s.state.player.position.z-c.position.z)<.02,c.name);
    // Warm-up/bookmark resets are setup only. No recovery is allowed after teleport.
    assert.equal(s.state.resets,setupResets,c.name);
    states[c.name]={setup:c,setupResets,snapshot:s};
    await page.screenshot({path:resolve(directory,`${c.name}.png`)});
    write('partial-states.json',{sourceSha256:source.sha256,states,errors});
    console.log(c.name);
  }
  assert.deepEqual(errors,[]);assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  write('capture-states.json',{sourceSha256:source.sha256,browser:browser.version(),
    toolSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope:`${selectedCases.length} public lower-city sightline inspections at 1440x900/DPR1. The original twelve defaults are unchanged; additional audit positions are available only through explicit view selection. South Gate bridge candidates are inside South Gate on the connector toward Lower Canal, not interior Canal evidence. Third-person uses an ordinary recorded look offset of .22 radians (-.22 for Central, +.22 elsewhere) to place the landmark beside the avatar; camera/FOV/avatar geometry are unchanged. Supported street/bridge/quay points are selected from the preserved district routes after conservative body/roof/terrain ray audits. Detail warms before each explicit teleport; the stationary setups do not measure native cadence or natural-route continuity. Locally occluded default views are retained separately. Visible skyline dominance is assessed from the saved pixels, not inferred from ray tests.`,
    states,errors});
}catch(error){write('failure.json',{sourceSha256:source.sha256,error:String(error),states,errors});throw error;}
finally{await browser.close();}
