# Voxarrium status

## Current milestone and gate

**M5.1 technical work is complete and stopped at the owner review gate. The demonstrated second-long construction/activation freezes are removed from six complete actual-input circuits; smaller frame gaps and explicit preparation/cache costs remain. Do not begin M6 or full-city generation.** Work performed 2026-09-30, America/Los_Angeles. The objective is retained verbatim in `docs/prompts/05-1-streaming-latency.md`. The complete prior M5 report is preserved in `docs/history/M5_STATUS.md`; original M5 artifacts remain under `artifacts/m5/`.

Initial preflight was clean on `milestone/m5-1-streaming-latency`, HEAD `640e67a267b4c7074aa98621e4a316a156d881ff`, the merged accepted M5 (#12). All M5.1 changes are local and uncommitted on that same branch. Two explicitly requested native children handled profiling and staged construction/reuse, without recursive delegation; the parent owns lifecycle contracts, integration, validation and this status. No dependency/provider/global configuration change, image generation, new visual content, GLB export, paid asset, remote deployment, push, PR or merge occurred.

## Implementation and measured decisions

The world remains exactly the accepted rural slice, River Market and existing eastern workshop shell. Stable serializable NPC/interaction/environment state stays outside render leases. Content, layouts, original random ordering, reference hashes and shipped GLBs are preserved; resident M2/M4 APIs exhaust the same authored construction generators synchronously.

- `requested → preparing → warming → ready → active` exposes real progress and retains inactive/unloaded/failed states, epoch cancellation and late-result disposal. A measured scheduler executes construction generators with a 3 ms soft slice target, at most 64 jobs per slice and cancellable requestAnimationFrame yields. Pigment strokes, terrain subdivision/colors, ecology/crowns, architecture/paving, instance transforms and NPC body/limbs are divided into jobs. True individual job maxima and oversize counts are retained; the target is not a preemptive hard limit.
- A renderer-owned cache admits at most 192 keys for immutable generated maps, botanical geometry, four enriched GLB templates and fixed-area terrain. Mutable material clones, transforms, instance buffers and figures remain area-owned. Identity leases distinguish cache references, instance references and stable asset IDs. Renderer teardown releases cached resources; cancellation releases partial area leases. Capacity is finite admission, not city-scale eviction.
- Full chronological reports retain request/data/assets/construction/resource creation or reuse/colliders/NPC tiers/audio/scene attachment/warmup/activation/first main-pass visible submission. Small jobs coalesce per slice while preserving exact individual maxima and CPU totals. Boundary-needed and exact boundary-crossed are separate milestones: waiting at a safety guard must not be mistaken for early readiness. Completed reports are exported then released before endpoint heap sampling; pending requests/late spans remain.
- Renderer preparation applies environment hooks before compile, disables destination frustum culling for compileAsync and stages real main/shadow passes into a matching linear HDR/sample offscreen target. Every actual InstancedMesh warms separately because instance-buffer counts affect generated WGSL. Only conservative static equivalents deduplicate. Two submissions share a queue fence, using distinct cameras to prevent same-camera/frame shadow suppression. Scene attachment, target and visibility restore synchronously before yielding/queue waiting; detached destination frustum flags restore in the enclosing finally. Cancellation prevents subsequent jobs/publication, but an existing compile/queue promise must settle before final release.
- Rapier destination proxies are created disabled in measured jobs. Activation enables them and populates broad phase before scene attachment and guard release. Deactivation disables them; unload removes them. The two resident handoff floors and safety guards remain. Total collider inventory includes disabled prepared proxies; enabled area inventory is reported separately.
- The runtime uses a 10 s velocity lookahead for expensive destinations and at most two area/transport leases. Entry/deactivation remain 36/44 m, with a 1.5 s continuous departure delay. Inactive retirement moves from the controller's historical 52 m default to 46 m: 6/5.4 ≈ 1.1 s earlier slot release covers the observed roughly 0.6 s rural readiness miss. Reversal cancels predictive demand; a unit test verifies interrupted departure resets the whole timer. The lightweight shell uses ordinary distance preload.
- Cold market preparation exceeds the direct run from spawn, so startup prepares this single neighbor before Explore. A stationary hint retains it until first horizontal movement releases normal predictive/departure behavior. This trades additional startup waiting for a prepared first handoff while leaving the shell unloaded.

No worker was added. The demonstrated hot construction includes Three.js/canvas/resource adaptation; pure transform/placement jobs are already incremental and have not established a meaningful worker benefit. DOM, WebAudio, Three.js renderer and Rapier remain on supported threads. Total asynchronous preparation duration includes waiting and is distinct from blocking CPU work.

## Native-gap investigation and retained intermediates

M5 rain/dusk actual traversal had 1,673.7 / 1,632.0 / 1,652.9 ms maxima. Timestamped tasks establish approximately one-second synchronous market import/composition and rural/terrain construction. After staged construction, incomplete streamed warmup still produced a 1,472.2 ms gap in `artifacts/m5-1/probe-before-complete-warmup.json`.

A focused actual-input clear/day native trace then captured a 1,389.7 ms rAF interval (page clock 21,828.1–23,217.8) overlapping a 1,394.015 ms WebGPU CommandBuffer::Flush on Chromium's GPU-process CPU thread. Native pipeline/shader compilation wall spans cover a 1,320.161 ms union: 93 APICreateRenderPipeline, 186 ShaderModuleD3D12::Compile and 93 DXC spans. Main-thread recorded wall union is 25.301 ms, task union 25.079 ms and GC union 2.660 ms. This establishes native CPU shader compilation in that gap; it does not measure GPU execution or OS scheduling.

The trace starts after early preparation but captures activation; it retains 1,979 intervals over 19.963 s. Explicit categories are devtools.timeline, blink.user_timing, gpu and gpu.dawn, with a 64 MiB binary buffer, maximum observed utilization 23.632% and 45 s cap. Exported JSON is about 79 MB. The first category-inventory invocation failed before recording and was diagnosed rather than retried broadly. Installed Three.js 0.186.1 source shows compileAsync skips real shadow updates, camera/frame shadow suppression, keyed target color/sample configuration and count-dependent instance WGSL. The corrected target, full instance coverage and actual shadow submissions address those demonstrated omissions. Evidence: `artifacts/m5-1/profiling/native-source-review.md` and `profiling/trace-clear-day-01/`.

The first full-coverage serialized warmup runs are preserved at `artifacts/m5-1/serialized-warmup/`: six complete circuits reached 48.5–80.3 ms maxima, but ten destinations missed the guard readiness milestone by 340.0–1,781.9 ms. All exact crossings occurred after readiness, demonstrating why that metric alone was insufficient. Two submissions per fence shortened preparation. The batched original-radius clear/day run is preserved at `batched-original-radius/clear-day/`; market guard readiness improved, while rural still missed by roughly half a second. The final 46 m retirement resolves those misses in the six final circuits below. No final native trace maps all 93 former late calls to individual meshes; after evidence is untraced browser cadence plus complete warmup chronology/source coverage.

## Final actual-input streaming measurements

Runtime source remained frozen across the final full browser suite, both exclusive timing runs and built production smoke. Chrome 154.0.8037.92, initialized WebGPU AMD/RDNA2, live Windows inventory AMD Radeon RX 6950 XT (driver 32.0.21045.5002), 1920x1080 / DPR1, seed 104729. Each preset completes three natural-spawn rural → River Market → workshop → River Market → rural circuits with actual W+Shift and yaw steering every 80 ms. Circuit two uses first-person, the others third-person. No teleports, bookmarks, manual stepping, competing render/tests/builds or resumed pauses enter these measurements. Run durations are 273.539 s clear/day and 272.951 s rain/dusk; each circuit's measured window excludes stationary endpoint export/GC.

| Preset / circuit | Samples / measured seconds | p50 / p95 / p99 ms | Maximum / transition maximum ms | Largest scheduler job ms | Intervals >33.3 ms | Raw / retained JS heap MB |
| --- | --- | --- | --- | ---: | ---: | --- |
| Clear/day 1 | 12,334 / 89.850 | 6.9 / 7.1 / 14.0 | 48.6 / 48.6 | 12.9 | 6 | 93.32 / 60.04 |
| Clear/day 2 | 12,257 / 90.007 | 6.9 / 7.1 / 14.1 | 48.7 / 48.7 | 14.8 | 5 | 69.57 / 62.93 |
| Clear/day 3 | 12,221 / 89.815 | 6.9 / 7.1 / 20.7 | 48.6 / 48.6 | 12.9 | 4 | 81.60 / 60.45 |
| Rain/dusk 1 | 11,077 / 89.804 | 7.0 / 13.9 / 14.1 | 62.6 / 62.6 | 15.8 | 2 | 66.76 / 60.14 |
| Rain/dusk 2 | 11,149 / 89.791 | 7.0 / 13.9 / 20.7 | 62.5 / 62.5 | 14.7 | 4 | 94.88 / 63.46 |
| Rain/dusk 3 | 10,884 / 89.920 | 7.0 / 14.0 / 14.1 | 55.5 / 55.5 | 30.2 | 2 | 71.66 / 61.07 |

All **24 of 24** destinations were ready before both boundary-needed and exact crossing, with no late/unobserved boundary cases. The first market request is prepared during startup, so its preparation is outside traversal frame sampling while the complete request chronology remains. Transition windows are request through first visible main-pass submission plus two seconds, clipped to the circuit window. All final sampled frame intervals and transition records report zero drops. Maximum final two-second activation interval is 34.7 ms.

| Destination | Clear/day request→ready range ms | Rain/dusk request→ready range ms | Minimum readiness lead before guard, clear / rain ms |
| --- | --- | --- | --- |
| River Market, including startup neighbor | 7,770.9–11,159.8 | 7,089.9–9,534.2 | 835.8 / 2,535.3 |
| Rural reload | 6,367.3–6,572.5 | 6,928.1–7,013.0 | 1,819.6 / 1,228.9 |
| Workshop shell | 119.6–155.6 | 158.1–207.3 | 6,470.9 / 6,407.8 |

Preparation duration equals request→ready for these requests and includes staged CPU work, frames and async waiting. Market object-construction wall spans range 308.0–676.2 ms; rural 514.8–670.8 ms, now distributed across many jobs rather than a one-second atomic continuation. Collider-creation spans are 29.8–35.6 ms market, 20.8–24.9 ms rural and 0.1–0.3 ms shell, also staged. CompileAsync wall ranges are 4,338.0–6,380.5 ms market, 3,139.0–3,383.3 ms rural and 22.3–38.2 ms shell. These aggregate spans include yields/waiting and are not single blocking tasks.

The largest job is one 30.2 ms `market.ground-normals` call in rain/dusk circuit three; other per-circuit maxima are 12.9–15.8 ms. Mesh normal/bounds calls and native renderer submission remain atomic within a job. The 3 ms budget is soft, not a guarantee that every job takes 3 ms. No intentional district construction job approaches hundreds of milliseconds in these final measurements.

## Ownership, continuity and cancellation

Every final rural return in both presets has the same exact ownership plateau:

| Inventory | All six equivalent rural returns |
| --- | --- |
| Renderer geometries / textures / visible materials | 296 / 15 / 65 |
| Owned render identities / references | 487 / 601 |
| Asset IDs / references | 3 / 3: rural cottage, bridge and shed |
| Immutable cache keys / capacity | 67 / 192 |
| Unique cache resources / cache references / instance references | 316 / 329 / 101 |
| Physics colliders / bodies | 110 / 1 |
| Enabled groups | 105 rural + two resident floors + two safety guards + player |
| Persistent NPC identities / unique identities | 42 / 42 |
| Audio loops / maximum voices | 5 / at most 5 |
| Loaded / active area at return | rural / rural |

Startup deliberately holds rural plus a prepared inactive market: 484 geometries / 15 textures / 65 visible materials, 877 render identities / 1,149 references, four leased asset IDs, 66 cache keys / 315 resources / 328 cache references / 259 instance references and 294 colliders / one body. Enabled collision remains rural-only. The first return populates the shell's additional cache key and establishes the rural-only plateau. M5 had 156 geometries / 19 textures / 65 visible materials and 279 owned identities at rural return; the higher retained geometry/ownership footprint is an explicit reuse tradeoff, not a disposal regression hidden by comparing unlike endpoints.

Cache hit counts rise with reuse, while entries/resources/lease counts remain fixed after the first full return. Zero disposed textures are recreated. Each preset records 13 loads/activations and 12 deactivations/unloads, no failed loads/late releases/errors. Checkpoints enforce at most two loaded areas and agreement between active areas and enabled collision. Weather/time targets, authoritative environment time, persistent identities and audio settings remain continuous. All 42 IDs persist at the shell as data-only state; deterministic browser circuits additionally verify NPC progress/freezing/resumption and persistent herb-garden visits.

Initial raw/retained JS heap is 96.37/53.06 MB clear and 90.92/53.35 MB rain. Forced-GC return heaps vary 60.04→62.93→60.45 and 60.14→63.46→61.07 MB, without monotonic growth. Completed telemetry is exported/discarded before GC; this avoids counting an accumulating diagnostic ledger as gameplay retention. Heap exceeds startup, and these three-return runs do not establish long-soak behavior, a memory ceiling or VRAM use.

The final headed cancellation test uses actual movement to retire the startup neighbor, trigger an unfinished market reload, turn back before activation, observe cancellation/rural-only ownership, then approach again and enter the unchanged market. It passes stable 42 identities, five audio loops, collision, zero resets/errors/texture recreation. Unit tests cover preparing/warming cancellation, late release, direction reversal, two-lease admission, scheduler abort/failure, shared resource ownership and departure timer reset. Evidence: `artifacts/m5-1/browser/actual-cancellation.json`, final browser and simulation reports.

## Final validation and visual evidence

- `npm test`: PASS, 9 Node + 99 simulation/assets/clock/lifecycle/diagnostic/preparation tests, **108 total**; `artifacts/m5-1/simulation-suite.json`.
- `npm run typecheck`: PASS; `npm run check`: PASS including typecheck, repository checks and five shipped asset checksums.
- `npm run build`: PASS; final main JS 5,501.92 kB minified / 2,010.06 kB gzip. Existing >500 kB chunk advisory remains; no unrelated bundle rewrite.
- `npm run references:verify`: PASS, all four original source-image hashes.
- `npm run doctor`: PASS, Node 22.16.0, Git 2.39.2.windows.1, Blender 5.2.1 LTS. This is tool readiness, not gameplay validation.
- `git diff --check`: PASS after the final documentation update.
- `VOXARRIUM_HEADED=1 npm run test:browser`: PASS **35/35**, zero retries/skips, 9.5 minutes. Preserved M1–M4 routes, controls/weather/audio/persistence, initialized WebGPU and explicit WebGL2, fallback/failure, three streamed circuits, shell views and actual cancellation/reentry. `artifacts/m5-1/browser-suite.json`.
- `VOXARRIUM_WEATHER=clear VOXARRIUM_LIGHT=day node tools/stress-streaming.mjs`, then rain/dusk: PASS, three complete actual-input circuits each as recorded above. Full reports/cycle chronology/state/frames are under `artifacts/m5-1/stress/clear-day/` and `stress/rain-dusk/`.
- `node tools/smoke-streaming-production.mjs`: PASS on built local preview, actual W moved 3.125 m, V/Esc, pointer capture and rain/night menu settings, initialized WebGPU, no development harness or browser errors. `artifacts/m5-1/production/production-smoke.json`. This is a production readiness/control smoke, not a production streaming soak.

An early simulation fixture assumed equal-clock report ordering; the test now compares completed-report membership, preserving runtime semantics. The complete final 99-test simulation suite passes. Measurement setup/driver failures and intermediate runs are retained separately: pre-sample capture failure, startup-vs-return asset assertion correction, early unaudited rain pause, and a final-policy clear partial attempt whose pointer capture disappeared while focus/visibility remained true. The bounded event log recorded no blur/Escape for that last loss; its cause is unestablished. Partial runs are excluded, no automatic resume occurred, and the final full runs retained capture throughout. Periodic checkpoints export aggregate data rather than multi-megabyte chronology during sampling; complete chronology/GC occurs outside windows.

Nine refreshed images were actually opened and inspected after the final full suite: rural eagle-eye/third-person/first-person clear/day, market eagle-eye/alley/doorway clear/day and workshop eagle-eye/third-person/first-person rain/dusk. They retain complete rural/market architecture and the same shell. Existing foliage/joinery/figure repetition, market parallel rows/broad quays, diagnostic capsule, workshop blank walls/flat ground and finite residency edges remain explicit art limits. No new visual defect was observed in these views; this is qualitative regression evidence, not owner art approval. Capture metadata and the review entry live in `docs/reference/REVIEWS.md` and `artifacts/m5-1/`.

Local gallery: `http://127.0.0.1:5173/artifacts/m5-1/review.html`, with nine images, compact `evidence-summary.json`, complete stress/native/cancellation/test/production links. Artifacts remain ignored and outside shipped public assets. No video was recorded.

## Remaining limits and handoff

The final 48.6–62.6 ms gaps are much smaller than the demonstrated second-long freezes, but are not zero stutter. Their complete native/OS cause is unmeasured; the largest individual normals job is identified without assigning all frame delay to it. Rain p95 rises from M5's 7.1 ms to 13.9–14.0 ms, so no broad throughput improvement is claimed. Both remain within this desktop's provisional p95 target; only the streaming tail improved substantially.

Request→ready remains seconds, and startup waits for a prepared first neighbor. Readiness margins were positive on this measured corridor/hardware; future speed, route, browser, hardware, assets or density may require retuning. Cache admission/lifetime and conservative static warmup signatures are for this three-area slice, not a city-scale cache policy. Future per-object shader callbacks, batched meshes or differing geometry-group mappings require additional warmup keys or a bypass. Compile/queue waits cannot be aborted mid-promise. WebGL2 correctness was checked separately; its performance is not represented by the WebGPU timing table.

No GPU timestamp queries, VRAM, physical presentation, OS scheduler, lower-end device, long soak, hosted CI or deployment results are claimed. Subjective art/audio/feel and owner acceptance remain pending. No technical blocker remains for this bounded M5.1 gate. Review this result before authorizing any M6 work; no city generation or expansion has begun.
