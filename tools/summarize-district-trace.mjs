import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Offline, bounded summary of a captured trace; never infers GPU/OS causality.
const directory = resolve(process.argv[2] ?? 'artifacts/m4-1/trace');
const events = JSON.parse(readFileSync(resolve(directory, 'browser-performance-trace.json'), 'utf8')).traceEvents;
const route = JSON.parse(readFileSync(resolve(directory, 'performance-route-60s.json'), 'utf8'));
const frames = events.filter(e => e.ph === 'X' && e.name === 'FunctionCall' &&
  e.args?.data?.functionName === 'frame' && /\/src\/main\.ts/.test(e.args.data.url)).sort((a,b) => a.ts-b.ts);
if (!frames.length) throw new Error('No actual game frame callbacks found in trace');
const { pid, tid } = frames[0];
const main = events.filter(e => e.ph === 'X' && e.pid === pid && e.tid === tid && e.dur > 0);
const compact = e => ({ name:e.name, startUs:e.ts, durationMs:e.dur/1000,
  functionName:e.args?.data?.functionName, url:e.args?.data?.url });
const top = list => list.toSorted((a,b) => b.dur-a.dur).slice(0,8).map(compact);
const gaps = frames.slice(1).flatMap((frame,i) => {
  const previous=frames[i], duration=frame.ts-previous.ts;
  if(duration<=33300) return [];
  const overlaps=main.filter(e => e.ts < frame.ts && e.ts+e.dur > previous.ts);
  return [{startUs:previous.ts,endUs:frame.ts,gapMs:duration/1000,overlappingMainSpans:top(overlaps)}];
});
const gc = main.filter(e => /(?:^V8\.GC|^MinorGC$|^MajorGC$|^GC)/.test(e.name));
const summary = {
  scope:'Recorded Chrome timeline wall durations. Nested spans overlap; do not sum. Callback gaps are separate from sampled rAF intervals. No GPU execution or OS scheduler timing.',
  measurement:{samples:route.samples,p95FrameMs:route.p95FrameMs,p99FrameMs:route.p99FrameMs,
    maxFrameMs:route.maxFrameMs,framesOver33ms:route.framesOver33ms,longFrames:route.longFrames},
  gameFrameCallbacks:frames.length,maxGameCallbackMs:Math.max(...frames.map(e=>e.dur))/1000,
  maxMainGcMs:gc.length?Math.max(...gc.map(e=>e.dur))/1000:null,
  largestGameCallbacks:top(frames),largestMainGc:top(gc),largestMainSpans:top(main),callbackGaps:gaps,
  conclusion:'Inspect overlapping spans before drawing a cause. A short game callback or GC span does not establish the source of a long rAF interval.',
};
writeFileSync(resolve(directory,'trace-findings.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({maxGameCallbackMs:summary.maxGameCallbackMs,maxMainGcMs:summary.maxMainGcMs,
  callbackGaps:gaps.map(g=>g.gapMs),largestMainSpans:summary.largestMainSpans.slice(0,3)}));
