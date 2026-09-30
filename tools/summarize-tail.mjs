import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

// Offline correlation. Recorded wall spans and absence of an event never establish an OS/GPU cause.
const directory = resolve(process.argv[2] ?? 'artifacts/m5/phase-a/clear-01');
const route = JSON.parse(readFileSync(resolve(directory, 'performance-route-60s.json'), 'utf8'));
const startupPath = resolve(directory, 'startup.json');
const startup = existsSync(startupPath) ? JSON.parse(readFileSync(startupPath, 'utf8')) : null;
const tracePath = resolve(directory, 'browser-performance-trace.json');
// ReturnAsStream uses one event per line. Two streaming passes avoid Node's string limit
// and retain only metadata/callbacks plus spans near the measured tail, even for >1GB traces.
async function* readTrace() {
  if (!existsSync(tracePath)) return;
  const lines = createInterface({ input: createReadStream(tracePath), crlfDelay: Infinity });
  let inside = false;
  for await (const raw of lines) {
    let line = raw.trim();
    if (line.startsWith('{"traceEvents":[')) { inside = true; continue; }
    if (inside && line.startsWith(']')) { inside = false; continue; }
    if (!inside || !line.startsWith('{')) continue;
    const metadata = line.indexOf('],"metadata":');
    if (metadata >= 0) { line = line.slice(0, metadata); inside = false; }
    yield JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line);
  }
}
const events = [], schedulingSet = new Set();
let eventCount = 0;
for await (const event of readTrace()) {
  eventCount++;
  if (event.ph === 'M' || event.name === route.traceAnchor?.name ||
    (event.ph === 'X' && event.name === 'FunctionCall' && event.args?.data?.functionName === 'frame' && /\/src\/main\.ts/.test(event.args.data.url))) events.push(event);
  if (schedulingSet.size < 120 && /scheduler|sequence_manager|cc|viz|gpu|benchmark/.test(event.cat ?? '')) schedulingSet.add(event.name);
}
const frameCallbacks = events.filter(event => event.ph === 'X' && event.name === 'FunctionCall' && event.args?.data?.functionName === 'frame' && /\/src\/main\.ts/.test(event.args.data.url)).sort((a, b) => a.ts - b.ts);
const mainPid = frameCallbacks[0]?.pid, mainTid = frameCallbacks[0]?.tid;
const names = new Map();
for (const event of events) if (event.ph === 'M' && event.name === 'thread_name') names.set(`${event.pid}:${event.tid}`, event.args.name);
const processes = new Map();
for (const event of events) if (event.ph === 'M' && event.name === 'process_name') processes.set(event.pid, event.args.name);
const anchor = events.find(event => event.name === route.traceAnchor?.name && (!mainPid || event.pid === mainPid));
const clockOffsetMs = anchor && route.traceAnchor ? anchor.ts / 1000 - route.traceAnchor.startTime : null;
const windows = clockOffsetMs === null ? [] : route.longFrames.map(frame => ({
  from: (frame.time - frame.interval + clockOffsetMs - 20) * 1000,
  to: (frame.time + clockOffsetMs + 20) * 1000,
}));
const spans = [], mainTop = [], mainTaskTop = [], gcTop = [];
const isTaskSpan = event => /^(?:ThreadControllerImpl::RunTask|RunTask|FunctionCall|FireAnimationFrame|TimerFire|EvaluateScript|EventDispatch|RunMicrotasks)$/.test(event.name);
const retainTop = (list, event) => {
  if (list.length < 8 || event.dur > list.at(-1).dur) { list.push(event); list.sort((a, b) => b.dur - a.dur); if (list.length > 8) list.pop(); }
};
const retainSpan = event => {
  const compactEvent = { name: event.name, cat: event.cat, pid: event.pid, tid: event.tid, ts: event.ts, dur: event.dur,
    args: event.args?.data ? { data: { functionName: event.args.data.functionName, url: event.args.data.url } } : undefined };
  if (event.pid === mainPid && event.tid === mainTid) {
    retainTop(mainTop, compactEvent);
    if (isTaskSpan(event)) retainTop(mainTaskTop, compactEvent);
    if (/^(?:V8\.GC|MinorGC|MajorGC|GC)/.test(event.name)) retainTop(gcTop, compactEvent);
  }
  if (windows.some(window => event.ts < window.to && event.ts + event.dur > window.from)) spans.push(compactEvent);
};
// Some compositor/scheduler categories use begin/end pairs instead of complete events.
const stacks = new Map();
for await (const event of readTrace()) {
  if (event.ph === 'X' && event.dur > 0) retainSpan(event);
  if (windows.some(window => event.ts >= window.from && event.ts <= window.to) && /(?:BeginFrame|DrawFrame|SubmitCompositorFrame|Presentation|SwapBuffers|FramePresented|Display::DrawAndSwap|DidNotProduceFrame)/i.test(event.name)) events.push({ name: event.name, cat: event.cat, pid: event.pid, tid: event.tid, ts: event.ts });
  if (event.ph !== 'B' && event.ph !== 'E') continue;
  const key = `${event.pid}:${event.tid}`;
  const stack = stacks.get(key) ?? []; stacks.set(key, stack);
  if (event.ph === 'B') stack.push(event);
  else {
    const start = stack.pop();
    if (start && event.ts > start.ts) retainSpan({ ...start, ph: 'X', dur: event.ts - start.ts });
  }
}
const main = spans.filter(event => event.pid === mainPid && event.tid === mainTid);
const gc = main.filter(event => /^(?:V8\.GC|MinorGC|MajorGC|GC)/.test(event.name));
const compact = event => ({
  name: event.name, category: event.cat, pid: event.pid, tid: event.tid,
  thread: names.get(`${event.pid}:${event.tid}`) ?? null, process: processes.get(event.pid) ?? null,
  startMs: event.ts / 1000, durationMs: event.dur / 1000,
  functionName: event.args?.data?.functionName, url: event.args?.data?.url,
});
const top = (list, limit = 8) => list.toSorted((a, b) => b.dur - a.dur).slice(0, limit).map(compact);
const max = list => list.length ? Math.max(...list.map(event => event.dur)) / 1000 : null;
function coverage(list, from, to) {
  const ranges = list.map(event => [Math.max(from, event.ts), Math.min(to, event.ts + event.dur)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0, lastStart = null, lastEnd = null;
  for (const [a, b] of ranges) {
    if (lastStart === null) { lastStart = a; lastEnd = b; }
    else if (a <= lastEnd) lastEnd = Math.max(lastEnd, b);
    else { total += lastEnd - lastStart; lastStart = a; lastEnd = b; }
  }
  return (total + (lastStart === null ? 0 : lastEnd - lastStart)) / 1000;
}
const tail = route.final?.tail;
const retainedRecords = [...new Map([...(tail?.records ?? []), ...(tail?.importantRecords ?? [])].map(record =>
  [`${record.kind}:${record.name}:${record.startMs}:${record.durationMs}`, record])).values()].sort((a, b) => a.startMs - b.startMs);
const gaps = route.longFrames.map(frame => {
  const fromMs = frame.time - frame.interval, toMs = frame.time;
  const appGap = tail?.frameGaps?.toSorted((a, b) => Math.abs(a.endMs - toMs) - Math.abs(b.endMs - toMs))[0];
  const records = retainedRecords.filter(record => record.startMs <= toMs + 20 && record.startMs + record.durationMs >= fromMs - 20);
  const timerGaps = route.timerProbe?.gaps?.filter(row => row.time - row.interval <= toMs + 60 && row.time >= fromMs - 60) ?? [];
  let trace = null;
  if (clockOffsetMs !== null) {
    const from = (fromMs + clockOffsetMs) * 1000, to = (toMs + clockOffsetMs) * 1000;
    const overlapping = spans.filter(event => event.ts < to && event.ts + event.dur > from);
    const threadGroups = new Map();
    for (const event of overlapping) {
      const key = `${event.pid}:${event.tid}`;
      const group = threadGroups.get(key) ?? []; group.push(event); threadGroups.set(key, group);
    }
    trace = {
      fromUs: from, toUs: to,
      recordedMainWallSpanCoverageMs: coverage(main, from, to), recordedGcWallSpanCoverageMs: coverage(gc, from, to),
      recordedMainTaskWallCoverageMs: coverage(main.filter(isTaskSpan), from, to),
      largestMainSpans: top(overlapping.filter(event => event.pid === mainPid && event.tid === mainTid)),
      largestMainTaskSpans: top(overlapping.filter(event => event.pid === mainPid && event.tid === mainTid && isTaskSpan(event))),
      nativeRendererApiSpans: top(overlapping.filter(event => /shader|pipeline|webgpu|d3d|RenderPipeline|CommandBuffer/i.test(event.name)), 16),
      nativeCompilationByThread: [...threadGroups.entries()].flatMap(([key, list]) => {
        const compilation = list.filter(event => /^(?:DeviceBase::APICreateRenderPipeline|ShaderModuleD3D12::Compile|CompileShaderDXC)$/.test(event.name));
        if (!compilation.length) return [];
        const counts = {};
        for (const event of compilation) counts[event.name] = (counts[event.name] ?? 0) + 1;
        return [{ key, thread: names.get(key) ?? null, process: processes.get(list[0].pid) ?? null, wallSpanCoverageMs: coverage(compilation, from, to), counts }];
      }),
      threads: [...threadGroups.entries()].map(([key, list]) => ({ key, name: names.get(key) ?? null, process: processes.get(list[0].pid) ?? null, recordedWallSpanCoverageMs: coverage(list, from, to), largestSpans: top(list, 4) })).sort((a, b) => b.recordedWallSpanCoverageMs - a.recordedWallSpanCoverageMs).slice(0, 12),
      nearbyPresentationSignals: events.filter(event => event.ts >= from - 20000 && event.ts <= to + 20000 && /(?:BeginFrame|DrawFrame|SubmitCompositorFrame|Presentation|SwapBuffers|FramePresented|Display::DrawAndSwap|DidNotProduceFrame)/i.test(event.name)).slice(-40).map(event => ({ name: event.name, category: event.cat, timestampMs: event.ts / 1000, thread: names.get(`${event.pid}:${event.tid}`) ?? null })),
    };
  }
  return { fromMs, toMs, intervalMs: frame.interval, timerGaps, matchedAppGap: appGap && Math.abs(appGap.endMs - toMs) < 25 ? appGap : null, retainedSubsystemRecords: records.slice(-32), trace };
});
const observedKinds = {};
for (const record of retainedRecords) observedKinds[record.kind] = (observedKinds[record.kind] ?? 0) + 1;
const schedulingNames = [...schedulingSet];
const summary = {
  scope: 'CPU/browser wall-time correlation only. Nested spans overlap; coverage is a union of retained trace spans, not CPU execution time. Timer/rAF gaps describe dispatch delays. Presentation/compositor events are browser signals, never GPU timestamp measurements or OS scheduling proof.',
  measurement: Object.fromEntries(['browserVersion', 'headed', 'scene', 'viewport', 'traceEnabled', 'samples', 'durationMs', 'medianFrameMs', 'p95FrameMs', 'p99FrameMs', 'maxFrameMs', 'framesOver33ms', 'reachedWaypoint', 'jsHeap', 'visibility', 'focused'].map(key => [key, route[key]])),
  startupSpans: startup?.tail?.spans ?? null,
  runtimeSpans: tail?.spans ?? null, observerSupport: tail?.support ?? null, retainedObservedKinds: observedKinds,
  capacities: tail?.capacity ?? null, dropped: tail?.dropped ?? null, maxRafTimestampAgeMs: tail?.maxRafTimestampAgeMs ?? null,
  timerProbe: route.timerProbe ?? null,
  trace: eventCount ? {
    eventCount, retainedTailSpans: spans.length, requestedTraceCategories: route.traceCategories, clockOffsetMs,
    categoryScope: route.traceCategories?.length ? 'Explicit requested category tokens' : 'Empty requested category filter used browser defaults; broad/intrusive diagnostic trace',
    gameFrameCallbacks: frameCallbacks.length, maxGameCallbackMs: max(frameCallbacks), maxMainGcMs: max(gcTop),
    largestGameCallbacks: top(frameCallbacks), largestMainGc: top(gcTop), largestMainSpans: top(mainTop), largestMainTaskSpans: top(mainTaskTop),
    schedulingPresentationSignalNames: schedulingNames,
    callbackGaps: frameCallbacks.slice(1).flatMap((frame, index) => { const previous = frameCallbacks[index], intervalMs = (frame.ts - previous.ts) / 1000; return intervalMs > 33.3 ? [{ fromMs: previous.ts / 1000, toMs: frame.ts / 1000, intervalMs }] : []; }),
  } : null,
  longRafGaps: gaps,
  conclusion: 'Review the correlated evidence before attributing a cause. A shared timer/rAF gap bounds the issue beyond one callback path; missing long JS/GC spans do not identify browser, GPU or OS scheduling as its cause. Do not infer GPU execution timing from renderer submission/queue-completion wall spans.',
  missingMeasurements: ['GPU timestamp queries and VRAM', 'OS scheduler/context-switch/driver timing', 'Physical display presentation/scanout latency', 'Hardware beyond the recorded local adapter', ...(eventCount && clockOffsetMs === null ? ['Trace-to-page clock anchor missing; trace correlation unavailable'] : [])],
};
writeFileSync(resolve(directory, 'tail-findings.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ directory, max: route.maxFrameMs, p99: route.p99FrameMs, timerMax: route.timerProbe?.maxIntervalMs, appMax: tail?.maxIntervalMs, maxCallback: summary.trace?.maxGameCallbackMs, maxGc: summary.trace?.maxMainGcMs, gaps: gaps.map(gap => ({ raf: gap.intervalMs, timers: gap.timerGaps.map(row => row.interval), mainCoverage: gap.trace?.recordedMainWallSpanCoverageMs, gcCoverage: gap.trace?.recordedGcWallSpanCoverageMs })), dropped: tail?.dropped }));
