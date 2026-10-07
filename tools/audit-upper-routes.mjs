import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {runtimeSourceSnapshot} from './runtime-source-snapshot.mjs';

// Offline evidence audit, after all native cadence windows have ended.
const inputs=process.argv.slice(2);
assert.equal(inputs.length,2,'Supply separate completed clear/day and rain/dusk directories.');
const source=runtimeSourceSnapshot(),runs=[];
for(const input of inputs){
  const report=JSON.parse(readFileSync(resolve(input,'stress-report.json'),'utf8'));
  assert.equal(report.runtimeSourceSha256,source.sha256);assert.equal(report.cycles,3);
  assert.equal(report.backend,'WebGPU');assert.deepEqual(report.errors,[]);
  assert.equal(report.final.state.population.length,224);
  for(const passed of Object.values(report.acceptance).filter(v=>typeof v==='boolean'))assert.equal(passed,true);
  const cycles=report.endpoints.map(e=>{
    const m=e.measurement,s=e.snapshot,r=s.render.streamingResources;
    assert(m.max<200);assert(m.transitions.transitionSpecificMaximumMs<200);assert.equal(m.dropped,0);
    assert.equal(m.transitions.readyBeforeBoundaryNeeded.late,0);assert.equal(m.transitions.readyBeforeBoundary.late,0);
    assert.equal(s.state.resets,0);assert.deepEqual(s.streaming.loadedIds,['rural']);assert.equal(s.npcTiers.uniqueIds,224);
    assert.equal(s.audio.activeLoops,5);assert(s.audio.activeVoices<=5);assert(r.cache.entries<=r.cache.capacity);
    assert(r.gpuPipelines.entries<=r.gpuPipelines.capacity);assert.equal(r.gpuPipelines.pending,0);
    return {cycle:e.cycle,samples:m.samples,p50:m.p50,p95:m.p95,p99:m.p99,max:m.max,
      transitionMaximum:m.transitions.transitionSpecificMaximumMs,largestPreparationJobMs:m.transitions.largestSchedulerJobMs,
      needed:m.transitions.readyBeforeBoundaryNeeded,crossing:m.transitions.readyBeforeBoundary,coverage:m.transitions.ledgerCoverage,
      retainedHeap:e.retainedHeap,rawHeap:e.rawHeap,ownership:{render:r.render,assets:r.assets,cache:r.cache,pipelines:r.gpuPipelines,
        geometries:s.render.geometries,textures:s.render.textures,visibleMaterials:s.render.visibleMaterials,
        physics:s.physics,npcTiers:s.npcTiers,audio:s.audio},heapSnapshot:e.heapSnapshot};
  });
  const peak=key=>Math.max(...report.checkpoints.map(s=>key(s)));
  runs.push({input,source:report.runtimeSourceSha256,preset:report.environmentPreset,browser:report.browserVersion,
    durationMs:report.durationMs,cycles,acceptance:report.acceptance,
    peaks:{liveLeases:peak(s=>s.streaming.loadedIds.length+s.streaming.pendingIds.length+s.streaming.retiringIds.length),
      cacheEntries:peak(s=>s.render.streamingResources.cache.entries),pipelines:peak(s=>s.render.streamingResources.gpuPipelines.entries),
      colliders:peak(s=>s.physics.colliders),bodies:peak(s=>s.physics.bodies),fullNpcs:peak(s=>s.npcTiers.counts['nearby-full']),
      reducedNpcs:peak(s=>s.npcTiers.counts['loaded-reduced']),unloadedNpcs:peak(s=>s.npcTiers.counts['unloaded-data']),
      activeLoops:peak(s=>s.audio.activeLoops),activeVoices:peak(s=>s.audio.activeVoices),
      allocatedDistrictEmitters:peak(s=>s.audio.districtEmitters.allocated),enabledDistrictEmitters:peak(s=>s.audio.districtEmitters.enabled)},
    nativeAudioContexts:report.nativeAudioContexts});
}
assert.deepEqual(runs.map(r=>r.preset.weather).sort(),['clear','rain']);
const result={sourceSha256:source.sha256,runs,scope:'Audit of six separate complete actual-input circuits on one frozen M9 runtime. Browser wall intervals and JS heaps are distinct from GPU time, VRAM or physical display timing. Modest heap growth and an unproven long-soak plateau remain disclosed; this audit does not establish arbitrary leak freedom.'};
mkdirSync('artifacts/m9/checks',{recursive:true});writeFileSync('artifacts/m9/checks/six-circuit-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceSha256:source.sha256,runs:runs.map(r=>({preset:r.preset,cycles:r.cycles.map(({ownership,...c})=>c),peaks:r.peaks})),errors:[]}));
