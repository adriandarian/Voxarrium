# Provisional performance budgets

These are review targets, not measured capabilities. Record the actual GPU/browser, resolution, device pixel ratio, backend, commit, world seed, camera and quality tier for every result. Do not infer VRAM from JS heap or call requestAnimationFrame timing GPU timing.

Initial desktop target: 60 FPS at 1920 × 1080 / DPR 1, with p95 total frame duration at or below 16.7 ms once the slice is representative. A 30 FPS reduced-quality mode is a fallback target. Neither is promised before hardware testing. Start with a 20 MB first-playable transfer goal, then revise from real assets. No universal triangle or draw-call ceiling is asserted.

Measure a fixed 60-second route after warmup: frame-duration distribution, long frames, loaded chunks/assets, geometry/material/texture counts, visible instances, active NPCs and JS heap where available. Use GPU timestamps only where supported and clearly record missing measurements. Record upload/compile stalls separately.

At scaling gates, walk across a stream boundary repeatedly, return to the starting position, then check for increasing resources or NPC duplication. Prioritize shared assets, instancing, LOD, spatial culling and fewer shadow-casting lights before removing the art direction's density. Screen-space effects, transparent vegetation and dynamic lights need individual timing.

No benchmark claim from headless software rendering. No quality percentage derived from an uncalibrated image-similarity number.

## M5.1 measured streaming tail

The final local M5.1 source on `milestone/m5-1-streaming-latency` completes three actual-input circuits per preset in headed Chrome 154.0.8037.92, initialized WebGPU, RX 6950 XT, 1920x1080 / DPR1, seed 104729. Runtime source was frozen; runs were exclusive, focused and captured. W+Shift and 80 ms yaw steering use natural spawn, alternating first/third-person, without teleports or deterministic stepping. Full methodology, startup/return inventories and exact reports are in [STATUS](../STATUS.md) and `artifacts/m5-1/stress/`.

| Circuit | Clear/day p50 / p95 / p99 ms | Clear max / transition max / largest job ms | Rain/dusk p50 / p95 / p99 ms | Rain max / transition max / largest job ms |
| --- | --- | --- | --- | --- |
| 1 | 6.9 / 7.1 / 14.0 | 48.6 / 48.6 / 12.9 | 7.0 / 13.9 / 14.1 | 62.6 / 62.6 / 15.8 |
| 2 | 6.9 / 7.1 / 14.1 | 48.7 / 48.7 / 14.8 | 7.0 / 13.9 / 20.7 | 62.5 / 62.5 / 14.7 |
| 3 | 6.9 / 7.1 / 20.7 | 48.6 / 48.6 / 12.9 | 7.0 / 14.0 / 14.1 | 55.5 / 55.5 / 30.2 |

All 24 destinations were ready before both the safety guard and exact crossing. Minimum guard readiness lead is 835.8 ms clear/day and 1,228.9 ms rain/dusk. Request→ready remains 7.0899–11.1598 s market, 6.3673–7.0130 s rural reload and 119.6–207.3 ms shell, including distributed work and async waiting. Startup prepares the first market neighbor before Explore; its preparation is outside traversal frame sampling. Transition maxima cover request through first main-pass visible submission plus two seconds, clipped to each circuit window. Maximum final two-second activation interval is 34.7 ms.

The old approximately one-second atomic construction paths are decomposed into measured requestAnimationFrame work slices. The 3 ms slice is a soft target: one `market.ground-normals` job reached 30.2 ms, and other circuit maxima were 12.9–15.8 ms. Individual normal/bounds calls and native submissions are not preemptible. Aggregate construction/collider/compile spans include yields/waiting; do not present their total duration as a single blocking task. A finite immutable cache, complete instanced/shadow warmup, two submissions per fence, 10 s velocity lookahead and 46 m inactive retirement preserve the two-area policy and positive measured readiness margins.

The incomplete-warmup investigation trace establishes a 1,389.7 ms rAF gap overlapping native CPU shader compilation (1,320.161 ms union), with main-thread task union 25.079 ms and GC union 2.660 ms. Matching HDR/sample target configuration, distinct warmup cameras and every actual InstancedMesh address installed r186 coverage differences. Final after runs are untraced; no per-object mapping of all former 93 pipeline calls or GPU execution claim is made. Source evidence and bounded trace coverage are retained at `artifacts/m5-1/profiling/`.

Every final rural return restores 296 geometries / 15 textures / 65 visible materials, 487 owned identities / 601 references, three leased asset IDs, 110 colliders / one body, 42 unique NPC identities and five bounded audio loops. Cache inventory stays 67/192 keys, 316 resources, 329 cache references and 101 instance references after first return; zero disposed textures are recreated. This deliberately retains more geometry/ownership than M5's 156 geometries / 279 identities. Startup includes a prepared inactive market and is explicitly a different inventory.

Forced-GC return JS heaps are 60.04 / 62.93 / 60.45 MB clear and 60.14 / 63.46 / 61.07 MB rain, without monotonic growth across three returns. Finished telemetry exports/drains and GC occur outside sampling; periodic checks transfer aggregates. These are bounded ownership/heap observations, not VRAM, a long soak or a memory ceiling.

The second-long tail is removed in these six circuits; 48.6–62.6 ms gaps remain with unestablished complete native/OS cause. Rain p95 rises from historical M5's 7.1 ms to 13.9–14.0 ms, so no broad throughput improvement is claimed. Future hardware, speed, route or content may exceed readiness margins. Lower-end performance, GPU timestamps, physical presentation and hosted CI remain unmeasured. Explicit WebGL2 passes correctness routes but has no comparable performance table. Stop at the M5.1 review gate.

## Historical M5 measured investigation

Five valid comparable M4 route measurements are retained under `artifacts/m5/phase-a/`: two untraced baselines, one broad traced baseline, and two untraced after-warmup runs. The traced 1,034.6 ms gap overlaps a 1,037.095 ms GPU-process WebGPU flush and 976.791 ms union of native CPU shader compilation spans. This is native CPU wall evidence, not GPU execution time. Main-thread task coverage is 46.602 ms and GC coverage 20.030 ms in that gap. The trace's broad category filter added overhead; the second untraced baseline that lost pointer lock/paused is excluded and replaced.

Full resident mesh and real-shadow warmup moved 40 pipeline calls from traversal to startup. The two after runs made zero new route pipeline/texture-upload calls, with maximum rAF intervals 80.8/49.5 ms versus 1,041.6/951.5 ms; p95 changed 13.9/14.0 to 14.4/14.5 ms. Startup compile cost increased to 8.738/7.969 s. This fixes the observed late compilation path in these clear/day runs, not every possible stall, other weather variant, streaming activation or device. Small unexplained gaps remain; checkpoint export contributes observer overhead. See `history/M5_STATUS.md` for these historical three-area stress measurements and resource results.

M5 also diagnosed r186 cached initial texture bindings recreating disposed market pigment maps on later preloads. Transient mapped-material cache keys now include map identity. The isolated diagnostic and three actual-input circuits restore 19 textures at each rural endpoint, with zero recreation. The existing large production chunk advisory remains tracked without an unrelated bundle rewrite.

Three complete actual W+Shift streaming circuits at 1920x1080/DPR 1 in rain/dusk report p50/p95/p99 6.9/7.1/13.9–14.0 ms, but maxima 1,673.7/1,632.0/1,652.9 ms and 32/26/34 intervals above 33.3 ms. Equivalent rural counts restore 156 geometries / 19 textures / 65 visible materials and 110 colliders / one body. Forced-GC endpoint JS heaps are 44.95/47.62/45.82 MB versus startup 40.15 MB; the measured returns are not monotonically increasing, but are not a long soak or VRAM evidence.

Timestamped browser tasks directly establish synchronous terrain/rural construction and market import/composition stalls around one second. Separately, all six market activations precede 1.556–1.674 s gaps by 104–130.5 ms, with low attributed main script and zero long-animation-frame blocking duration. Native/shadow compilation is a supported target for further investigation, not established by this untraced stress run. Asynchronous compile/load duration includes waiting and must not be equated with blocking CPU time. Exact timings, buffer coverage, load/unload ranges, NPC tiers, resource counts and unresolved M5 review risks are recorded in `history/M5_STATUS.md`. The historical percentile target passed on this desktop; smooth streaming boundaries did not.

## Historical M4 measured gate

See `history/M4-1_STATUS.md` for the retained M4 gate context and `artifacts/m4/` for actual Chrome/RX 6950 XT/WebGPU 1080p route data and resource counts. Clear/traced-clear/rain p95 is 13.8/13.9/13.8 ms, while maxima reach 652.8/882.0/881.8 ms. The local p95 target passes; stall-free behavior does not. The actual browser trace finds no single synchronous JavaScript/GC duration explaining the gaps; GPU/OS scheduling is unmeasured and cause remains unresolved. No speculative optimization, streaming or distance LOD was introduced at that gate. The five GLBs total 7,130,880 bytes; first-playable network transfer is not measured.
