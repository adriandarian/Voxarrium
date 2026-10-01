/** Offline/page-clock correlation only. No inference about GPU execution or physical presentation. */
export function summarizeTransitions(ledger, frames, sampleStartMs, sampleEndMs) {
  const reports = (ledger?.reports ?? []).flatMap(report => {
    const visible = report.firstVisibleAtMs ?? report.activationAtMs;
    const milestone = visible ?? report.readyAtMs ?? report.endedAtMs ?? sampleEndMs;
    const fromMs = Math.max(sampleStartMs, report.startedAtMs);
    const toMs = Math.min(sampleEndMs, milestone + (ledger.activationWindowMs ?? 2000));
    if (toMs < fromMs) return [];
    const overlapping = frames.filter(frame => frame.time >= fromMs && frame.time - frame.interval <= toMs);
    const activation = visible === null ? [] : overlapping.filter(frame => frame.time >= visible && frame.time - frame.interval <= visible + (ledger.activationWindowMs ?? 2000));
    const preparation = report.readyAtMs === null ? overlapping : overlapping.filter(frame => frame.time - frame.interval <= report.readyAtMs);
    const maximum = list => list.reduce((value, frame) => Math.max(value, frame.interval), 0);
    const spans = report.records.filter(record => record.kind === 'span-end');
    return [{
      id: report.id, areaId: report.areaId, requestId: report.requestId, outcome: report.outcome,
      requestAtMs: report.startedAtMs, readyAtMs: report.readyAtMs, boundaryAtMs: report.boundaryAtMs,
      activationAtMs: report.activationAtMs, firstVisibleAtMs: report.firstVisibleAtMs,
      preparationDurationMs: report.preparationDurationMs, requestToReadyMs: report.requestToReadyMs,
      readyBeforeBoundary: report.readyBeforeBoundary, readyLeadBeforeBoundaryMs: report.readyLeadBeforeBoundaryMs,
      boundaryNeededAtMs: report.boundaryNeededAtMs, readyBeforeBoundaryNeeded: report.readyBeforeBoundaryNeeded,
      readyLeadBeforeBoundaryNeededMs: report.readyLeadBeforeBoundaryNeededMs,
      frameWindow: { fromMs, toMs, samples: overlapping.length, maximumMs: maximum(overlapping),
        preparationMaximumMs: maximum(preparation), activationMaximumMs: maximum(activation),
        longFrames: overlapping.filter(frame => frame.interval > 33.3) },
      largestSchedulerJob: report.largestSchedulerJob,
      totalSchedulerJobs: report.totalSchedulerJobs, totalSchedulerCpuMs: report.totalSchedulerCpuMs,
      nativeAdjacentWallSpans: spans.filter(record => /compile|warm|queue|shadow/i.test(record.name)),
      completeChronology: report.completeChronology, pendingSpans: report.pendingSpans, droppedRecords: report.droppedRecords,
    }];
  });
  return { reports,
    transitionSpecificMaximumMs: reports.reduce((maximum, report) => Math.max(maximum, report.frameWindow.maximumMs), 0),
    largestSchedulerJobMs: reports.reduce((maximum, report) => Math.max(maximum, report.largestSchedulerJob?.durationMs ?? 0), 0),
    readyBeforeBoundary: { ahead: reports.filter(report => report.readyBeforeBoundary === true).length,
      late: reports.filter(report => report.readyBeforeBoundary === false).length, unobserved: reports.filter(report => report.readyBeforeBoundary === null).length },
    readyBeforeBoundaryNeeded: { ahead: reports.filter(report => report.readyBeforeBoundaryNeeded === true).length,
      late: reports.filter(report => report.readyBeforeBoundaryNeeded === false).length, unobserved: reports.filter(report => report.readyBeforeBoundaryNeeded === null).length },
    ledgerCoverage: ledger ? { capacity: ledger.capacity, dropped: ledger.dropped } : null,
    limitations: [
      'Frames are rAF browser wall intervals, associated by interval overlap with request through first submitted visible frame plus 2000 ms. Requests can overlap.',
      'Transition windows are clipped to this cycle sample; a request that started before the sample can have incomplete sampled frame coverage.',
      'All native-adjacent spans are caller CPU/browser wall measurements. Compile/queue awaits include waiting and do not establish native CPU or GPU execution attribution.',
      'Ready-before-boundary is unobserved until both milestones exist. Ledger reports are retained separately in the full endpoint snapshot.',
    ],
  };
}
