# Provisional performance budgets

These are review targets, not measured capabilities. Record the actual GPU/browser, resolution, device pixel ratio, backend, commit, world seed, camera and quality tier for every result. Do not infer VRAM from JS heap or call requestAnimationFrame timing GPU timing.

Initial desktop target: 60 FPS at 1920 × 1080 / DPR 1, with p95 total frame duration at or below 16.7 ms once the slice is representative. A 30 FPS reduced-quality mode is a fallback target. Neither is promised before hardware testing. Start with a 20 MB first-playable transfer goal, then revise from real assets. No universal triangle or draw-call ceiling is asserted.

Measure a fixed 60-second route after warmup: frame-duration distribution, long frames, loaded chunks/assets, geometry/material/texture counts, visible instances, active NPCs and JS heap where available. Use GPU timestamps only where supported and clearly record missing measurements. Record upload/compile stalls separately.

At scaling gates, walk across a stream boundary repeatedly, return to the starting position, then check for increasing resources or NPC duplication. Prioritize shared assets, instancing, LOD, spatial culling and fewer shadow-casting lights before removing the art direction's density. Screen-space effects, transparent vegetation and dynamic lights need individual timing.

No benchmark claim from headless software rendering. No quality percentage derived from an uncalibrated image-similarity number.

## M5 measured investigation

Five valid comparable M4 route measurements are retained under `artifacts/m5/phase-a/`: two untraced baselines, one broad traced baseline, and two untraced after-warmup runs. The traced 1,034.6 ms gap overlaps a 1,037.095 ms GPU-process WebGPU flush and 976.791 ms union of native CPU shader compilation spans. This is native CPU wall evidence, not GPU execution time. Main-thread task coverage is 46.602 ms and GC coverage 20.030 ms in that gap. The trace's broad category filter added overhead; the second untraced baseline that lost pointer lock/paused is excluded and replaced.

Full resident mesh and real-shadow warmup moved 40 pipeline calls from traversal to startup. The two after runs made zero new route pipeline/texture-upload calls, with maximum rAF intervals 80.8/49.5 ms versus 1,041.6/951.5 ms; p95 changed 13.9/14.0 to 14.4/14.5 ms. Startup compile cost increased to 8.738/7.969 s. This fixes the observed late compilation path in these clear/day runs, not every possible stall, other weather variant, streaming activation or device. Small unexplained gaps remain; checkpoint export contributes observer overhead. See STATUS for the actual three-area stress measurements and resource results.

M5 also diagnosed r186 cached initial texture bindings recreating disposed market pigment maps on later preloads. Transient mapped-material cache keys now include map identity. The isolated diagnostic and three actual-input circuits restore 19 textures at each rural endpoint, with zero recreation. The existing large production chunk advisory remains tracked without an unrelated bundle rewrite.

Three complete actual W+Shift streaming circuits at 1920x1080/DPR 1 in rain/dusk report p50/p95/p99 6.9/7.1/13.9–14.0 ms, but maxima 1,673.7/1,632.0/1,652.9 ms and 32/26/34 intervals above 33.3 ms. Equivalent rural counts restore 156 geometries / 19 textures / 65 visible materials and 110 colliders / one body. Forced-GC endpoint JS heaps are 44.95/47.62/45.82 MB versus startup 40.15 MB; the measured returns are not monotonically increasing, but are not a long soak or VRAM evidence.

Timestamped browser tasks directly establish synchronous terrain/rural construction and market import/composition stalls around one second. Separately, all six market activations precede 1.556–1.674 s gaps by 104–130.5 ms, with low attributed main script and zero long-animation-frame blocking duration. Native/shadow compilation is a supported target for further investigation, not established by this untraced stress run. Asynchronous compile/load duration includes waiting and must not be equated with blocking CPU time. Exact timings, buffer coverage, load/unload ranges, NPC tiers, resource counts and unresolved review risks are recorded in STATUS. The percentile target passes on this desktop; smooth streaming boundaries do not.

## Historical M4 measured gate

See `../STATUS.md` for actual Chrome/RX 6950 XT/WebGPU 1080p route data and resource counts. Clear/traced-clear/rain p95 is 13.8/13.9/13.8 ms, while maxima reach 652.8/882.0/881.8 ms. The local p95 target passes; stall-free behavior does not. The actual browser trace finds no single synchronous JavaScript/GC duration explaining the gaps; GPU/OS scheduling is unmeasured and cause remains unresolved. No speculative optimization, streaming or distance LOD is introduced. The five GLBs total 7,130,880 bytes; first-playable network transfer is not measured.
