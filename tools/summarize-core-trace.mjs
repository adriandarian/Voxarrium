import {createReadStream,readFileSync,writeFileSync,statSync} from 'node:fs';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';

// Offline streaming passes retain only callbacks and twelve largest spans.
// The binary trace buffer expands when Chrome exports JSON; cap its input too.
const directory=process.argv[2]??'artifacts/m8/profiling/headless-civic-idle';
const path=`${directory}/browser-performance-trace.json`;
assert(statSync(path).size<=512*1024*1024,'Native trace JSON exceeds 512 MiB input cap.');
async function* events(){
  const lines=createInterface({input:createReadStream(path),crlfDelay:Infinity});let inside=false;
  for await(const raw of lines){let line=raw.trim();
    if(line.startsWith('{"traceEvents":[')){inside=true;continue;}
    if(inside&&line.startsWith(']')){inside=false;continue;}
    if(!inside||!line.startsWith('{'))continue;
    const metadata=line.indexOf('],"metadata":');if(metadata>=0){line=line.slice(0,metadata);inside=false;}
    yield JSON.parse(line.endsWith(',')?line.slice(0,-1):line);
  }
}
const frames=[],categoryCounts={},threadNames={};let eventCount=0;
for await(const e of events()){
  eventCount++;for(const category of (e.cat??'').split(','))categoryCounts[category]=(categoryCounts[category]??0)+1;
  if(e.ph==='M'&&e.name==='thread_name')threadNames[`${e.pid}:${e.tid}`]=e.args?.name;
  if(e.ph==='X'&&e.name==='FunctionCall'&&e.args?.data?.functionName==='frame'&&/\/src\/main\.ts/.test(e.args.data.url)){
    assert(frames.length<10000,'Diagnostic callback count exceeds cap.');frames.push(e);
  }
}
assert(frames.length,'No actual game frame callbacks in native trace.');
const {pid,tid}=frames[0],mainTop=[],gcTop=[],nativeTop=[];
const compact=e=>({name:e.name,category:e.cat,startUs:e.ts,durationMs:e.dur/1000,
  pid:e.pid,tid:e.tid,thread:threadNames[`${e.pid}:${e.tid}`],functionName:e.args?.data?.functionName,url:e.args?.data?.url});
const top=(list,e)=>{if(list.length<12||e.durationMs>list.at(-1).durationMs){list.push(e);list.sort((a,b)=>b.durationMs-a.durationMs);if(list.length>12)list.pop();}};
const gaps=frames.slice(1).map((frame,i)=>({fromUs:frames[i].ts,toUs:frame.ts,
  intervalMs:(frame.ts-frames[i].ts)/1000,priorCallbackMs:frames[i].dur/1000,nextCallbackMs:frame.dur/1000,mainSpans:[],nativeSpans:[]}))
  .sort((a,b)=>b.intervalMs-a.intervalMs).slice(0,8);
const retain=e=>{if(!e.dur)return;const main=e.pid===pid&&e.tid===tid,native=/gpu|dawn|dxc|pipeline|shader|compile/i.test(`${e.cat} ${e.name}`);
  if(!main&&!native)return;const row=compact(e);
  if(main){top(mainTop,row);if(/GC|Garbage|Scavenge|MarkCompact/i.test(e.name))top(gcTop,row);}
  else top(nativeTop,row);
  for(const gap of gaps)if(e.ts<gap.toUs&&e.ts+e.dur>gap.fromUs)top(main?gap.mainSpans:gap.nativeSpans,
    {...row,overlapMs:(Math.min(e.ts+e.dur,gap.toUs)-Math.max(e.ts,gap.fromUs))/1000});
};
const stack=[];
for await(const e of events()){
  if(e.ph==='X')retain(e);
  if(e.pid!==pid||e.tid!==tid)continue;
  if(e.ph==='B'){assert(stack.length<1000,'Trace stack exceeds bound.');stack.push(e);}
  else if(e.ph==='E'){const start=stack.pop();if(start&&e.ts>start.ts)retain({...start,dur:e.ts-start.ts});}
}
const diagnostic=JSON.parse(readFileSync(`${directory}/diagnostic.json`,'utf8'));
const report={source:diagnostic.runtimeSourceSha256,inputBytes:statSync(path).size,eventCount,categoryCounts,gameFrameCallbacks:frames.length,
  measurement:{samples:diagnostic.samples,p50:diagnostic.p50,p95:diagnostic.p95,p99:diagnostic.p99,max:diagnostic.max},
  largestCallbacks:frames.map(compact).sort((a,b)=>b.durationMs-a.durationMs).slice(0,12),largestMainGc:gcTop,largestMainSpans:mainTop,
  largestNativeNamedSpans:nativeTop,largestCallbackIntervals:gaps,
  callbackCoverage:{firstUs:frames[0].ts,lastUs:frames.at(-1).ts,durationSeconds:(frames.at(-1).ts-frames[0].ts)/1e6,
    measuredIntervalCount:diagnostic.samples,traceCallbackCount:frames.length,
    note:'The finite trace may cover less than the rAF sample window. Trace-completion data-loss metadata is available only when the capture driver saved it.'},
  maximumObservedBufferUsage:Math.max(0,...diagnostic.bufferUsage.map(b=>b.percentFull??0)),
  method:'Two streaming passes over bounded native trace JSON; callback cap 10000, main-thread nesting cap 1000, eight callback intervals and twelve largest span rows per class/window. Complete native-named events may belong to other processes. Nested wall spans must not be summed. Callback start intervals are distinct from rAF timestamp intervals.',
  conclusion:'This bounded trace is diagnostic. Native timeline wall spans and GC coverage do not establish GPU execution or OS scheduling, or assign the cause of gaps in earlier untraced runs. Tracing overhead excludes acceptance cadence.',scenario:diagnostic.scope};
writeFileSync(`${directory}/trace-findings.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({source:report.source,inputBytes:report.inputBytes,eventCount,gameFrameCallbacks:frames.length,
  measurement:report.measurement,largestCallbacks:report.largestCallbacks.slice(0,3),largestMainGc:gcTop.slice(0,3),maximumObservedBufferUsage:report.maximumObservedBufferUsage}));
