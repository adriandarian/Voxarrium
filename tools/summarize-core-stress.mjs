import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import assert from 'node:assert/strict';

// Offline extraction. Keep full frame/chronology evidence in the input report.
const directory=resolve(process.argv[2]);
const input=resolve(directory,'stress-report.json');
const report=JSON.parse(readFileSync(input,'utf8'));
assert.equal(report.endpoints.length,report.cycles);
const summary={input,sourceSha256:report.runtimeSourceSha256,browser:report.browserVersion,
  execution:report.execution,environment:report.environmentPreset,durationMs:report.durationMs,
  acceptance:report.acceptance,errors:report.errors,counts:report.final.streaming.counts,
  cycles:report.endpoints.map(e=>{
    const m=e.measurement,s=e.snapshot,r=s.render.streamingResources;
    return {cycle:e.cycle,samples:m.samples,p50:m.p50,p95:m.p95,p99:m.p99,max:m.max,
      dropped:m.dropped,transitionMax:m.transitions.transitionSpecificMaximumMs,
      largestJobMs:m.transitions.largestSchedulerJobMs,needed:m.transitions.readyBeforeBoundaryNeeded,
      crossing:m.transitions.readyBeforeBoundary,coverage:m.transitions.ledgerCoverage,
      requests:m.transitions.reports.map(t=>({id:t.id,areaId:t.areaId,outcome:t.outcome,
        requestToReadyMs:t.requestToReadyMs,neededLeadMs:t.readyLeadBeforeBoundaryNeededMs,
        crossingLeadMs:t.readyLeadBeforeBoundaryMs,completeChronology:t.completeChronology,
        droppedRecords:t.droppedRecords,pendingSpans:t.pendingSpans})),
      retainedHeap:e.retainedHeap,loaded:s.streaming.loadedIds,active:s.streaming.activeIds,
      ownership:{render:r.render,assets:r.assets,cache:r.cache,pipelines:r.gpuPipelines,
        geometries:s.render.geometries,textures:s.render.textures,visibleMaterials:s.render.visibleMaterials,
        physics:s.physics,npcTiers:s.npcTiers,audio:s.audio,resets:s.state.resets},
      heapSnapshot:e.heapSnapshot};
  }),
  nativeAudioContexts:report.nativeAudioContexts,
  limits:'Extraction of retained local evidence, not a new execution or causal comparison. rAF is browser wall time; JS heap/counts are not GPU execution, VRAM, physical display timing or proof of arbitrary leak freedom.'};
const output=resolve(process.argv[3]??`artifacts/m8/checks/${basename(directory)}-summary.json`);
writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({output,sourceSha256:summary.sourceSha256,acceptance:summary.acceptance,
  cycles:summary.cycles.map(({requests,ownership,heapSnapshot,...s})=>s),errors:summary.errors}));
