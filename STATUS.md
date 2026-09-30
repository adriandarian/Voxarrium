# Voxarrium status

## Current milestone and gate

**M5 bounded technical proof is complete and stopped at the owner review gate. All final browser/build/tests pass; substantial streaming preparation and activation stalls remain explicitly bounded review risks. Do not begin full-city generation.** Work performed 2026-09-30, America/Los_Angeles. The owner objective is retained verbatim in `docs/prompts/05-streaming-proof.md`. It treats the merged rural/market as accepted inputs. Historical M4.1 evidence and review limits are preserved in `docs/history/M4-1_STATUS.md`; no new owner artistic approval is invented.

Initial preflight was clean on `milestone/m5-streaming-proof`, HEAD `ab6b657125a9ba77fb2e6884b495fee8f5e71a46`, the merged River Market review build (#11), including the M4.1 art pass. M5 changes remain local and uncommitted. Two explicitly requested native children handled diagnostics and lifecycle files without recursive delegation. Parent owns interfaces, integration, tests and this status. No dependency/provider/global configuration change, image generation, new GLB export, paid asset, remote service, deployment, push/PR or merge occurred.

## Phase A: demonstrated compilation tail

Three valid 60-second actual-W River Market walks reproduce the long frames. The broad traced baseline shows the 1,034.6 ms rAF gap overlapping a 1,037.095 ms WebGPU command-buffer flush on Chromium's GPU-process CPU thread. Its nested native compilation spans cover a 976.791 ms union: 33 pipeline API calls, 66 D3D12 shader compile spans and 36 DXC compile spans. Main-thread task coverage is 46.602 ms and GC coverage 20.030 ms in that gap. An earlier 492.9 ms gap overlaps a 492.291 ms game callback with renderer CPU submission 490.1 ms. Untraced repeats make 40 late pipeline calls with renderer submission spikes 399.9/528.1 ms. This attributes the observed tail to late shader/pipeline compilation; the exact individual variant trigger is not identified.

The focused fix temporarily disables Mesh frustum culling while compiling the full resident scene, submits one real shadow pass, restores flags in finally, waits for startup queue completion and renders normally before readiness. Installed Three.js compileAsync filters by camera frustum and skips shadow updates during precompilation. No legacy shader patch, renderer replacement or speculative physics/NPC rewrite was made.

| Actual-W 60-second route, 1920x1080 / DPR1 | Samples | p50 / p95 / p99 ms | Maximum ms | Late pipeline calls |
| --- | ---: | --- | ---: | ---: |
| Baseline clear-01 | 7,428 | 7.0 / 13.9 / 14.0 | 1,041.6 | 40 |
| Baseline clear-03 | 5,588 | 7.1 / 14.0 / 20.8 | 951.5 | 40 |
| Broad traced baseline | 6,718 | 7.0 / 14.0 / 14.1 | 1,034.6 | 40 |
| After warmup 01 | 6,221 | 7.3 / 14.4 / 16.7 | 80.8 | 0 |
| After warmup 02 | 6,170 | 7.4 / 14.5 / 15.9 | 49.5 | 0 |

Both after runs have zero new texture uploads, errors, pause, recovery or missing NPCs. They reach waypoint 9 versus baseline waypoint 8; these one-minute routes do not finish the full circuit. Resident endpoint counts remain 497 geometries / 24 textures / 117 visible materials / 42 NPCs. Forty pipeline calls moved from traversal to startup: 321+40 becomes 361+0. Startup compileAsync rises from 6.372/6.934 s to 8.738/7.969 s. CPU submission maximum falls to 17.6/18.4 ms. p95 rises modestly, so no broad throughput improvement is claimed.

Smaller gaps remain: checkpoint exports explain many 34-57 ms intervals, while the first after run has early 76.4/80.8 ms gaps of unestablished cause. Audio is synthesized locally; startup/generation CPU spans are recorded and no compressed-audio decoding occurs. Browser observer callbacks and renderer/upload hooks are CPU wall signals. The trace category discovery initially selected no tokens, producing a broad intrusive 1.15 GB trace; the tool now handles category groups explicitly, and the bounded offline parser preserves that limitation. Baseline clear-02 lost pointer lock/paused and is excluded/replaced by clear-03. No GPU timestamp queries, physical presentation timing, VRAM or OS scheduler tracing exist. Evidence: `artifacts/m5/phase-a/`, including actual reports, startup telemetry, trace findings and route screenshots.

## Phase B: exactly three streamed areas

The default M5 world consists of accepted rural, accepted River Market additions and one lightweight eastern shell, x=146..218 m with three plain workshop masses. It adds no NPC, quest, combat, interior, multiplayer or city generator. The resident M4 comparison remains `/?scene=m4`, rural `/?scene=m2`, M1 `/?scene=m1`.

The lifecycle uses 36 m preload, 44 m deactivation, 52 m unload and 1.5 s hysteresis, cancellation/epochs and late-result cleanup. Asset IDs and render-resource identity leases are separate. Prepared geometry compiles against the authoritative scene; colliders install before activation. Deactivation detaches geometry and removes its collision; unload releases leases, roof/wind/wetness hooks and figures. Two narrow handoff floors and destination-not-ready guards keep the tested corridor safe. The same player/camera traverse it without a loading screen or reset.

All 42 NPCs remain serializable resident data with stable IDs. Nearby active-area simulation uses fixed ticks; loaded distant NPCs update at 10 Hz; unloaded NPCs perform no navigation or animation and preserve segment/wait/distance while observing current schedule/weather targets. On return, they continue/respond to authored conditions. Existing persistent-interactable visits/closed state also live outside render handles. One authoritative environment and one audio graph continue across boundaries. Two reused market loops fade on leaving; three global loops and at most five transient voices remain bounded. Settings are not saved across a page reload.

Initial browser circuits exposed a real texture leak: r186 cached initial bindings recreated a disposed market stone map during a later compileAsync. Diagnostics identify texture ID/area/create/destroy and the binding stack, without retaining Texture objects. Final mapped materials include map identity in their public cache key while preserving the original TSL key; native identical shader reuse remains available. The isolated three-cycle diagnostic changes rural GPU textures from 19/20/21 to 19/19/19, with zero resurrection. Complete deterministic browser walks then restore exact counts in all three cycles.

| Equivalent rural endpoint | Initial | Cycle 1 | Cycle 2 | Cycle 3 |
| --- | ---: | ---: | ---: | ---: |
| Renderer geometries / textures / visible materials | 156 / 19 / 65 | 156 / 19 / 65 | 156 / 19 / 65 | 156 / 19 / 65 |
| Owned render resources / asset IDs | 279 / 3 | 279 / 3 | 279 / 3 | 279 / 3 |
| Physics colliders / bodies | 110 / 1 | 110 / 1 | 110 / 1 | 110 / 1 |
| Persistent NPC IDs / unique IDs | 42 / 42 | 42 / 42 | 42 / 42 | 42 / 42 |
| Herb-garden visits | 1 | 1 | 1 | 1 |
| Authoritative environment seconds | 87.100 | 309.433 | 531.567 | 754.033 |

The 110 colliders comprise 105 rural, two resident floors, two unavailable-destination guards and the player. At the shell endpoint all 42 NPCs are data-only and unchanged during an additional ten simulated seconds while environment time advances. Rural return has six full/36 unloaded NPCs. Thirteen total loads and twelve unloads occur across the three circuits; no lifecycle failures or duplicate emitters. Evidence: `artifacts/m5/browser/circuits.json`. These deterministic real-physics walks are distinct from the actual keyboard stress below.

## Actual-input streaming stress and remaining tails

Three complete rural → market → eastern shell → market → rural circuits use actual W+Shift from natural spawn, with yaw steering every 80 ms, no setup teleport/bookmark or manual physics stepping. Chrome/WebGPU, 1920x1080 / DPR 1, seed 104729, rain/dusk; cycle two uses first-person, the others third-person. Audio settings remain master 0.40 / ambience 0.55 / footsteps 0.65 / locals 0.45. The bounded run lasts 295.731 s with no errors, pause, recovery, navigation failure, duplicate IDs or audio loops. Forced endpoint GC is outside the measured rAF windows. Each endpoint is normalized to the same third-person view after its measurement window.

| Actual circuit | Samples / measured seconds | p50 / p95 / p99 ms | Maximum ms | Intervals >33.3 ms | Raw / retained JS heap MB |
| --- | --- | --- | ---: | ---: | --- |
| 1 | 12,702 / 98.668 | 6.9 / 7.1 / 13.9 | 1,673.7 | 32 | 86.41 / 44.95 |
| 2 | 12,365 / 97.175 | 6.9 / 7.1 / 14.0 | 1,632.0 | 26 | 128.07 / 47.62 |
| 3 | 12,660 / 98.426 | 6.9 / 7.1 / 13.9 | 1,652.9 | 34 | 81.30 / 45.82 |

Initial raw/retained heap is 49.70/40.15 MB. Retained heap increases from startup, then varies without monotonic growth across the three returns; this bounded run does not establish long-soak behavior or attribute retained bytes to a particular cache. All equivalent rural endpoints restore 156 geometries / 19 textures / 65 visible materials, 279 owned render resources / three asset IDs, 110 colliders / one body, 42 unique persistent NPCs, five reused audio loops and at most five transient voices. Zero disposed textures are recreated. Checkpoints sample a maximum 498 geometries / 25 textures / 118 visible materials; this is not an absolute peak measurement. Active collision groups agree with active areas throughout.

Observed NPC tiers include 11 full / 31 reduced / zero unloaded while both accepted areas are loaded, zero full / 36 reduced / six unloaded when the market is loaded at a distance, six full / zero reduced / 36 unloaded at rural return, and zero full / zero reduced / 42 unloaded at the shell. Weather, wind, lighting targets, audio settings and authoritative environment time remain continuous across boundaries. This proves bounded ownership and state continuity, not smooth boundary timing.

| Area | Loads / unloads | Preparation range ms | Unload range ms |
| --- | --- | --- | --- |
| Rural, including initial load | 4 / 3 | 4,198.5–5,626.5 | 2.5–5.2 |
| River Market | 6 / 6 | 6,047.9–8,178.0 | 4.1–7.2 |
| Eastern shell | 3 / 3 | 28.2–33.3 | 0.1–0.2 |

Preparation includes fetch, parsing, construction and asynchronous compilation waiting. It is not a single blocking task. Two distinct remaining costs have timestamped evidence:

- **Synchronous preparation:** market reload gaps of approximately 875–1,042 ms overlap import/composition spans of 927–1,000 ms plus 61–67 ms of NPC construction. Browser long tasks of 982–1,051 ms attribute the work to the asset response continuation; parsing and subsequent composition are not precisely separated. Rural return gaps of 1,256.8 / 1,215.2 / 1,583.2 ms overlap terrain construction of 271.7 / 271.5 / 369.3 ms plus rural construction of 935.4 / 897.5 / 1,165.4 ms, with corresponding 1,259 / 1,222 / 1,583 ms main-frame long tasks. Budgeting existing construction into yielding batches is a demonstrated future optimization target; earlier preload alone cannot remove synchronous work.
- **After market activation:** all six activations are followed 103.9–130.5 ms later by 1,555.5–1,673.7 ms gaps, after renderer CPU submissions of 104.5–126 ms. Overlapping long-animation-frame records report zero blocking duration and about 12–20 ms of attributed main-thread script. Some nearby pipeline hooks are retained. Preparation uses compileAsync without a real shadow submission; installed Three.js skips real shadow updates during precompilation. Late shadow/native compilation is a supported investigation target, but this stress run has no native trace establishing the cause. The full gap is not claimed as JavaScript, GC or GPU execution time.

Largest-gap correlation below uses the shared page performance clock, in milliseconds. Preparation has already completed before these gaps begin.

| Circuit | Area preparation complete | Market activation | Gap begins | Gap duration | Preceding renderer CPU submission |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 67,843.1 | 67,845.0 | 67,975.5 | 1,673.7 | 126.0 |
| 2 | 121,267.2 | 121,268.8 | 121,384.9 | 1,632.0 | 107.9 |
| 3 | 219,182.1 | 219,183.3 | 219,287.2 | 1,652.9 | 107.7 |

Four asynchronous compile spans per cycle total 15.907 / 15.314 / 15.799 s, with aggregate maxima 6.960 / 6.659 / 6.894 s, including waiting. All sampled rAF intervals, gap records and important observer records are retained with zero drops; the frequent slow-span ring overwrites 14,146 / 13,266 / 14,112 records, so individual completed compile timestamps are unavailable. Ten-second state exports and steering add observer overhead. Evidence: `artifacts/m5/stress/stress-report.json` and `cycle-0.json` through `cycle-2.json`. The Phase A fix is demonstrated for resident clear/day M4; the substantial M5 preparation/activation tails remain explicitly unresolved at review.

## Current validation

- `npm test`: PASS, 9 Node + 84 simulation/assets/clock/lifecycle/diagnostic tests, 93 total; `artifacts/m5/simulation-suite.json`.
- `npm run check`, `npm run typecheck`, `npm run references:verify`, `npm run doctor`: PASS. All four original hashes and five shipped asset checksums remain valid. Node 22.16.0, Git 2.39.2.windows.1, Blender 5.2.1 LTS.
- `npm run build`: PASS. Main JS 5,479.38 kB minified / 2,003.13 kB gzip. The existing large-chunk advisory remains tracked; no measured streaming transfer case justifies unrelated bundle work.
- Final `npm run test:browser` with `VOXARRIUM_HEADED=1`: PASS, 34/34 installed-Chrome tests in 8.6 minutes, no retries or skips; `artifacts/m5/browser-suite.json`. Preserved M1–M4 controls, fallback/failure, disposal, weather/NPC/audio and both district routes pass alongside all four M5 cases. The earlier 33/34 run exposed a diagnostic query into freed Rapier state during the preserved M3 disposal snapshot. Physics statistics now report zero safely after disposal; focused regression and final complete suite both pass. The earlier result is retained separately.
- `npm run stress:streaming` via `node tools/stress-streaming.mjs`: PASS, the three actual-input circuits and measurements above.
- `node tools/smoke-streaming-production.mjs`: PASS against the built default M5 local preview on 4173. Actual W moves 3.044 m; V switches first-person, Esc/menu select rain/night and resume, all 42 locals remain, no development harness exists even with `?test=1`, zero browser errors. Evidence: `artifacts/m5/production/production-smoke.json` and `.png`. This is a controls/readiness smoke, not a complete production streaming soak.
- Final `git diff --check` and `npm run check`: PASS. Git reports existing CRLF-to-LF normalization notices, not whitespace errors. Runtime source remained frozen throughout the final full suite and production smoke.

Actual initialized browser backend is WebGPU on Chrome 154.0.8037.92, adapter AMD/RDNA2. Current Windows GPU inventory: AMD Radeon RX 6950 XT, driver 32.0.21045.5002, status OK. Explicit WebGL2 handoff and preserved fallback/failure paths pass separately. Doctor alone does not test gameplay. GPU execution/VRAM, lower-end hardware, hosted CI and a long soak are unmeasured.

## Review handoff

Saved eagle-eye, third-person and first-person views have been opened and inspected; three concrete visual limitations are recorded in `docs/reference/REVIEWS.md`. `artifacts/m5/review.html` brings the actual captures, measured circuits and evidence links together; the existing local dev server serves it at `http://127.0.0.1:5173/artifacts/m5/review.html`. This ignored evidence stays outside shipped public assets. Human review of art/feel, finite residency edges and substantial preparation/activation stalls is the next gate. No implementation or local-check blocker remains; smooth handoffs and subjective art/audio acceptance are not claimed. Do not begin M6/full-city work automatically.
