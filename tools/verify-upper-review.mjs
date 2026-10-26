import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';
import {upperReviewPaths} from './upper-review-paths.mjs';

// Offline evidence viewer only. Run after measured game traversal has ended.
const {root,paths,sourceSha256}=upperReviewPaths();
const directory=`${root}/${paths.verification}`;
assert(!existsSync(directory),'Preserve existing viewer verification; select a fresh output path.');
mkdirSync(directory,{recursive:true});
const source=runtimeSourceSnapshot();
if(sourceSha256)assert.equal(sourceSha256,source.sha256);
const data=JSON.parse(readFileSync(`${root}/${paths.audit}`,'utf8'));
assert.equal(data.runs.length,2);
for(const run of data.runs){assert.equal(run.source,source.sha256);assert.equal(run.cycles.length,3);}
const captures=JSON.parse(readFileSync(`${root}/${paths.browser}/capture-states.json`,'utf8'));
const waterfront=JSON.parse(readFileSync(`${root}/${paths.waterfront}/capture-states.json`,'utf8'));
assert.equal(waterfront.sourceSha256,source.sha256);assert.equal(Object.keys(waterfront.states).length,2);
const sightlines=JSON.parse(readFileSync(`${root}/${paths.sightlines}/capture-states.json`,'utf8'));
assert.equal(sightlines.sourceSha256,source.sha256);assert.equal(Object.keys(sightlines.states).length,12);
assert.equal(captures.sourceSha256,source.sha256);assert.equal(Object.keys(captures.states).length,31);
const imageCount=1+Object.keys(captures.states).length+Object.keys(waterfront.states).length+Object.keys(sightlines.states).length;
const motion=JSON.parse(readFileSync(`${root}/${paths.motion}/evidence.json`,'utf8'));
assert.equal(motion.sourceSha256,source.sha256);assert.equal(motion.clips.length,4);
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  // The review is a standalone artifact with embedded observation data. Loading
  // its file URL also keeps development-server live reload out of this check.
  await page.goto(pathToFileURL(resolve(root,paths.output)).href);
  await page.locator('img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
  await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));
  assert.equal(await page.locator('img').count(),imageCount);
  assert.equal(await page.locator('video').count(),4);
  const initial=await page.locator('#state').innerText();assert(initial.includes('clear-day'));
  await page.locator('#time').evaluate(slider=>{slider.value='500000';slider.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.notEqual(await page.locator('#state').innerText(),initial);
  await page.locator('#preset').selectOption('rain-dusk');assert((await page.locator('#state').innerText()).includes('rain-dusk'));
  await page.locator('#play').click();await page.waitForTimeout(500);await page.locator('#play').click();
  assert(Number(await page.locator('#time').inputValue())>0);
  await page.locator('#reset').click();assert.equal(await page.locator('#time').inputValue(),'0');
  await page.screenshot({path:`${directory}/viewer.png`});
  const videos=[];
  for(const video of await page.locator('video').all()){
    const metadata=await video.evaluate(async video=>{
      if(video.readyState<1)await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('Video metadata failed')),{once:true});video.load();});
      await new Promise((resolve,reject)=>{video.addEventListener('seeked',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('Video decode failed')),{once:true});video.currentTime=8;});
      return {src:video.getAttribute('src'),duration:Number.isFinite(video.duration)?video.duration:null,
        durationMetadata:Number.isFinite(video.duration)?'finite':'streaming WebM has unbounded duration metadata',
        width:video.videoWidth,height:video.videoHeight,time:video.currentTime,readyState:video.readyState};
    });
    if(metadata.duration!==null)assert(metadata.duration>=11);
    assert.equal(metadata.time,8);assert.equal(metadata.width,1440);assert.equal(metadata.height,900);assert(metadata.readyState>=2);
    await video.screenshot({path:`${directory}/video-${videos.length}-8s.png`});
    // Rewind and play actual decoded frames with the element visible. This
    // supplements seek/metadata checks; it is not gameplay cadence evidence.
    const before=await video.evaluate(async video=>{
      await new Promise((resolve,reject)=>{video.addEventListener('seeked',resolve,{once:true});
        video.addEventListener('error',()=>reject(new Error('Video rewind failed')),{once:true});video.currentTime=0;});
      video.muted=true;const frames=video.getVideoPlaybackQuality().totalVideoFrames;
      await video.play();return frames;
    });
    await page.waitForTimeout(2000);
    const playback=await video.evaluate(video=>{video.pause();return {time:video.currentTime,
      frames:video.getVideoPlaybackQuality().totalVideoFrames,ended:video.ended};});
    assert(playback.time>0.3);assert(playback.frames>before,'Native playback did not decode another frame');
    await video.screenshot({path:`${directory}/video-${videos.length}-playing.png`});
    videos.push({...metadata,playback:{...playback,framesBefore:before}});
  }
  assert.deepEqual(errors,[]);
  assert.equal(runtimeSourceSnapshot().sha256,source.sha256);
  const report={sourceSha256:source.sha256,browser:browser.version(),images:imageCount,referenceImages:1,videos,controls:'Preset, timeline, play/pause and reset exercised.',
    scope:'Native browser loaded the standalone file URL, decoded the saved review videos and rendered the exported observation viewer after game measurements; this does not measure gameplay cadence.',errors};
  writeFileSync(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
