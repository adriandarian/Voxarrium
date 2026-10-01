# Testing and visual review

## M5.1 streaming latency procedures

The objective is retained in `prompts/05-1-streaming-latency.md`. Run `npm test`, `npm run check`, `npm run build`, `npm run doctor`, `npm run references:verify`, then `VOXARRIUM_HEADED=1 npm run test:browser`. These test the preserved resident scenes and both initialized backends, actual-input cancellation/reentry, staged scheduler/cache ownership, and repeated real-physics streaming. Startup prepares the first market neighbor; cancellation coverage first retires that lease through ordinary movement and departure delay, then reverses an unfinished reload. Save `artifacts/test-results.json` before another runner invocation.

Freeze runtime source and stop competing rendering/build work before measuring. Run the following sequentially in PowerShell:

```powershell
$env:VOXARRIUM_WEATHER = 'clear'
$env:VOXARRIUM_LIGHT = 'day'
node tools/stress-streaming.mjs
$env:VOXARRIUM_WEATHER = 'rain'
$env:VOXARRIUM_LIGHT = 'dusk'
node tools/stress-streaming.mjs
```

Each bounded run completes three actual W+Shift circuits from natural spawn, alternating gameplay cameras, without teleports or deterministic stepping. Separate preset directories under `artifacts/m5-1/stress/` retain full rAF samples, p50/p95/p99/max, transition-window maxima, largest individual job, preparation/request-to-ready duration, readiness before exact crossing and before the safety guard is needed. Chronology remains attached to each exported endpoint. Startup prepared collision can exceed final rural-only collision; compare all three equivalent rural returns to the first return's exact finite cache/physics/GPU plateau, while retaining startup values and the allocation difference explicitly. Visible material counts, enabled collision groups, 42 unique NPC IDs, environment/audio continuity and bounded loaded areas remain checked throughout.

Raw and forced-GC endpoint JavaScript heaps are separate from VRAM. Finished diagnostic reports are exported outside the page, then released before endpoint heap sampling so the capture ledger is not confused with gameplay retention. Unfinished requests and late spans are kept. These bounded circuits do not prove a long soak or lower-end hardware performance.

The headed measurement tab must remain focused with pointer capture. The driver brings it forward once before starting, records startup capture state, and checks pause/focus/visibility/capture at checkpoints. A bounded 128-event focus/pointer-lock log is retained in newer reports. A pause or capture rejection fails the run; do not resume automatically or include that partial attempt in the performance comparison. Periodic checkpoints and waypoint assertions transfer aggregate tail data, while complete request chronology is exported at stationary returns after interval sampling ends. Preserve failed attempts and diagnose their cause before another invocation.

When a significant unexplained gap remains, `node tools/trace-streaming.mjs` runs one actual-input approach with a finite native trace buffer and 45 s trace cap. It uses explicit categories observed in this host's prior trace when Chromium category discovery is incomplete. Inspect its coverage and failed/pre-recording attempts; the M5.1 investigation trace starts after early preparation but captures activation. `node tools/summarize-tail.mjs <trace-directory>` reports native CPU compilation unions and main/GC overlap. Native CPU time, browser wall spans and GPU execution remain distinct.

Production readiness/controls use the built local preview and `node tools/smoke-streaming-production.mjs`; this is not a production soak. M5 evidence stays preserved. Current M5.1 captures and exact outcomes are linked from STATUS.md; stop at its review gate.

## M5 streaming proof procedures

This section describes retained M5 procedures/results under `artifacts/m5/`. The current stress and production tools default to M5.1 directories; use the procedures above for current validation. The original report is preserved at `history/M5_STATUS.md`.

M5 is the default; prior district tests and measurement tools explicitly select `?scene=m4`. Run `npm test`, `npm run check`, `npm run build`, `npm run references:verify` and `npm run doctor`. The browser command includes the preserved M1-M4 projects plus `streaming-browser`. Set `VOXARRIUM_HEADED=1` for the local hardware evidence. Exact outcomes and limitations belong in STATUS.md; the historical results below describe their original milestones.

Final local M5 results: 9 Node + 84 non-browser simulation/asset/clock/lifecycle/diagnostic tests pass (93 total), strict check/typecheck, production build, references and doctor pass, and all 34 headed installed-Chrome browser cases pass with no skips or retries. The final report is `artifacts/m5/browser-suite.json`. Three actual-input stress circuits and the built production controls/readiness smoke also pass their assertions. Stable counts do not imply smooth boundaries: reproducible synchronous construction and activation-associated stalls remain recorded in STATUS. The earlier full-suite disposal regression was corrected and the complete suite rerun.

The M5 browser circuit walks all three areas continuously with the real fixed-step physics adapter in three full cycles. It asserts every arrival, grounded collision without recovery, installed collider areas, stable 42 IDs and accumulated NPC progress, data-only NPC freezing while authoritative time advances, persistence of an existing herb-garden visit, continuous rain/dusk, five bounded audio loops, resource reference totals and exact renderer endpoint counts. An injected initial-asset failure tests visible failure without an unhandled rejection or retry loop. WebGL2 independently traverses the rural-to-market handoff. `npm run capture:m5` records shell third-person, first-person and eagle-eye views after walking there; camera/state metadata accompanies them. These deterministic tests are distinct from the actual keyboard stress measurement.

With source stable and no other rendering/test/build activity, run `node tools/measure-tail.mjs` sequentially with distinct `VOXARRIUM_TAIL_DIR` directories. It uses the original 60-second actual-W M4 route at 1920x1080/DPR1, after 3s warmup. `VOXARRIUM_TRACE=1` enables one diagnosed trace; clear the setting for comparable untraced repeats. Offline `node tools/summarize-tail.mjs <directory>` correlates timestamped CPU subsystem/observer events and nested native trace span unions. Tracing overhead and the invalid paused baseline are labeled in STATUS. Never label this GPU execution time, VRAM or OS scheduler proof.

`npm run stress:streaming` runs exactly three bounded actual W+Shift circuits from natural rural spawn through market, shell, market and rural. The lightweight harness reads position/steers yaw every 80 ms without extra draws; it never teleports, bookmarks or deterministic-steps. Weather is fixed rain/dusk and four nondefault audio settings are applied through menu inputs. First/third-person alternate across cycles. A 10-minute global limit and 35 s leg limit fail stalled navigation. Ten-second checkpoints and each arrival retain state/resources/tiers. Every cycle reports rAF p50/p95/p99/max, long-frame timestamps, loaded/active areas and lifecycle preparation/disposal durations. CDP raw and forced-GC endpoint JS heaps are reported separately; forced GC occurs outside measured rAF windows. First-use shader caches may change the baseline; repeated equivalent endpoints must remain stable. Heap is not VRAM. Evidence is under ignored `artifacts/m5/stress/`.

Do not edit runtime source while any browser test/measurement is running: Vite reload invalidates that run. Do not run multiple browsers or builds alongside timing measurements. Preserve `artifacts/test-results.json` after each complete suite before another Playwright invocation overwrites it. After building, `node tools/smoke-streaming-production.mjs` uses the local 4173 preview to verify default M5 readiness, actual W/V/Esc, pointer lock, menu rain/night and absence of the development harness. It is a local production smoke, not a complete production streaming soak or hosted CI claim.

`artifacts/m5/review.html` is the ignored local gallery of actual three-view shell and preserved-market captures, stress metrics and report links. Open it from the existing dev server at `http://127.0.0.1:5173/artifacts/m5/review.html`. Camera/state metadata and concrete visual limitations accompany it. These views support the M5 owner review; they do not approve M6 art or hide finite residency edges.

## M4.1 art-convergence evidence

Set `VOXARRIUM_HEADED=1` and `VOXARRIUM_DISTRICT_CAPTURE_DIR=artifacts/m4-1/final` for `npm run test:browser`. The preserved suite covers M1–M4, both entire district circuits, real controls/dialogue/audio/shelter, WebGPU, explicit WebGL2, capability-masked fallback and visible initialization failure. The evidence test includes additional market goods, quay service/waterline and third-person alley views. `npm run capture:m4` can rerun just the capture case. Store the test report separately before another Playwright invocation overwrites `artifacts/test-results.json`.

With the local dev server running and source stable, run `node tools/measure-district.mjs` three times sequentially, using output directories `artifacts/m4-1/performance`, `artifacts/m4-1/trace` and `artifacts/m4-1/rain`. The first is clear/day; the second sets `VOXARRIUM_TRACE=1`; the third clears the trace setting and sets `VOXARRIUM_WEATHER=rain`. Do not run concurrent rendering while measuring. Each experiment is explicitly bounded to 60 seconds of actual W input with waypoint steering at 1920×1080/DPR 1. Main-thread trace inspection is offline via `node tools/summarize-district-trace.mjs artifacts/m4-1/trace`; it reports bounded callback/GC spans without inferring a GPU/OS cause. rAF wall intervals and JS heap remain distinct from GPU time and VRAM.

After `npm run build`, the existing preview on 4173 supports `node tools/smoke-district-production.mjs`, with the same final capture-directory setting. It tests real W/V/Esc, pointer lock, rain/night menu controls and absence of the development harness. Once all evidence exists, `node tools/review-district-art.mjs` creates `artifacts/m4-1/review.html`, preserving before/after camera metadata and explicitly labeling unmatched poses. Evidence is ignored outside shipped public assets. Human artistic approval remains pending regardless of automated check results.

## M4 district procedures

Current `npm test` passes 9 Node plus 59 simulation/assets/clock tests (68 total). District coverage loads the real GLB, composes six archetypes, samples actual Rapier street/camera/door clearance, walks the complete circuit outward and in reverse, checks rail containment, samples every NPC graph edge and continues serialized day/rain/night schedules without jumps. Existing M1–M3 coverage remains. `artifacts/m4/simulation-suite.json` retains the 59-test runner report; Node results are command output.

Current `npm run test:browser` passes all 30 headed installed-Chrome tests, zero retries/skips. `district-browser` adds full continuous district routes in third/first person, real keyboard controls/dialogue, market audio/shelter/pause behavior, review captures and an explicit WebGL2 rain bridge crossing. Older rural projects explicitly use `?scene=m2`; M4 is the default. Full result: `artifacts/m4/browser-suite.json`.

```powershell
$env:VOXARRIUM_HEADED = '1'
$env:VOXARRIUM_CAPTURE_DIR = 'artifacts/m4/regression'
$env:VOXARRIUM_DISTRICT_CAPTURE_DIR = 'artifacts/m4/final'
npm run test:browser
npm run capture:m4
```

Sixteen authored district views plus route endpoints and WebGL2 evidence live under `artifacts/m4/final/`, with complete camera/state/backend/count metadata in `capture-states.json`. `living-verification.json` records digital audio signal/muting, merchant activity and rain shelter. This does not prove subjective sound quality or physical headphone listening. The review gallery is `artifacts/m4/review.html` while the local dev server runs. Owner art/feel acceptance remains pending.

With source stable and no other test browser using the GPU, `node tools/measure-district.mjs` runs a bounded 60-second headed Chrome actual-W route at 1920×1080/DPR 1 after three seconds of warmup. `VOXARRIUM_DISTRICT_CAPTURE_DIR` selects its report directory; `VOXARRIUM_WEATHER` and `VOXARRIUM_LIGHT` select exact presets. Only the initial bookmark places the player; subsequent movement uses W and yaw steering. This timed sample need not finish the full circuit; separate route tests prove it. Reports include rAF distribution/long-frame times, counts, checkpoints, active population, loaded assets and JS heap. Set `VOXARRIUM_TRACE=1` for one diagnosed repeat with a CDP performance trace if long frames recur. Trace overhead must be labeled. These are wall intervals, not GPU execution times; heap is not VRAM.

After `npm run build` and local preview on 4173, `node tools/smoke-district-production.mjs` checks actual W/V/Esc/menu rain/night controls, 42 locals, no development harness even with `?test=1` and zero browser errors. Actual results, trace findings and remaining risks are in STATUS.md. No city streaming/soak, lower-end device, hosted CI or traversal video is claimed.

## M3 living-slice procedures

`npm test` runs 9 Node reference/contracts tests and 45 non-browser simulation/asset/clock tests. New coverage exercises environment blending and JSON continuation, source geometry/material ownership, roof-clipped rain/reduced counts, six deterministic NPC routines, interaction, weather reversal, surface categories and the existing rural Rapier navigation. Every authored NPC graph edge is sampled at 12 cm with actual Rapier capsule overlap and support rays.

`npm run test:browser` includes preserved M1 and M2 projects plus `living-browser`. M3 checks actual F dialogue in both gameplay views, weather/time UI, pause/resume, running/jumping in rain, gesture-started Web Audio signal/muting, spatial listener/river position, recovery/disposal, and explicit WebGL2 wind/rain/river crossing. `npm run capture:m3` captures day/cloudy/dusk/night/rain, the interaction panel, and an identical-camera motion pair. Exact state, backend, browser, camera, viewport/DPR and render counts accompany the files. Set `VOXARRIUM_HEADED=1` for visible Chrome; `VOXARRIUM_CAPTURE_DIR=artifacts/m3/final` selects the ignored evidence directory.

The full headed run passed 24/24 before the final test-only lifecycle addition; that additional recovery/disposal test then passed 1/1. `artifacts/m3/browser-suite.json` preserves the full-run report and `final/lifecycle-verification.json` records the added test. Current complete suite includes 25 tests. No skips/retries were added. The first simulation attempt exposed an interaction fixture at the last millimeters of its segment; the test now chooses a truly mid-segment local. Its continuity checks aggregate max step/elevation over the same 12,000 frames, avoiding 144,000 separate assertions. Final `npm test` passes all 54 combined tests.

Run `node tools/measure-rural.mjs` against the dev server for the bounded 60-second real-input route. `VOXARRIUM_WEATHER=rain` and `VOXARRIUM_LIGHT=day` choose a measured M3 preset. These are exact bounded states, not a random weather clock. Fresh M2 baseline, M3 clear and M3 rain reports live in `artifacts/m3/baseline/`, `final/`, and `rain/`. Each reaches waypoint 14 with one setup teleport, no recovery/pause/errors, but does not finish the full return within a minute. rAF intervals and JS heap are not GPU time/VRAM; cadence varied between runs, so mean changes do not isolate added-system cost. See STATUS for actual values and long frames.

After `npm run build`, serve preview on 4173 and run `node tools/smoke-rural-production.mjs`. It walks with W, changes camera with V, opens authored dialogue with F and selects rain/dusk through the menu. It verifies the development harness is absent even with `?test=1`. `final/rain-river-audio.webm` is a three-second internal live audio-graph recording; `audio-verification.json` records nonzero signal after click, zero output during pause/master mute and surface/listener facts. It is not a microphone recording or a claim that physical speakers/headphones were listened to. Subjective sound quality remains part of owner review.

The historical canonical day eagle-eye/third-person/first-person baseline and M3 conditions match exactly (`artifacts/m3/comparison-conditions.json`). `artifacts/m3/review.html` presents the before/after and environment views with explicit pose-comparison limits. M3 required no new runtime asset or dependency. Its original human-review decision is retained in the review log; the subsequent explicit M4 objective and merged M3 authorize the current bounded district.

## Bootstrap checks (implemented)
Run `npm ci` from the committed bootstrap lockfile. `npm test`: Node tests for reference verification, corruption/missing-file behavior, and repository-contract checks. `npm run check`: expected documentation/configuration files and manifest sanity. `npm run doctor`: local Node/Git/Blender diagnostics. `npm run references:verify`: strict signatures, byte counts, hashes and dimensions for all four committed originals. CI uses the same strict command; missing or corrupt originals fail. `npm run blender:fixture`: isolated local calibration export and GLB header validation; runtime scale, axes and materials require the M1 runtime.

## M1 checks (implemented)

- `npm run typecheck`: strict TypeScript across runtime/config/tests.
- `npm run build`: typecheck then Vite production bundle. `npm run preview` serves it locally on port 4173.
- `npm test`: 9 Node reference/contracts tests plus 17 Playwright-runner tests without a browser: 10 Rapier/course/camera tests, 6 actual GLTFLoader/fixture/timing tests, and 1 suspension/clock test.
- `npm run check`: repository contracts, vendored calibration checksum, tool syntax and typecheck.
- `npm run test:browser`: 10 real Chrome tests covering readiness/backend, deterministic traversal in both gameplay views, run/jump/ceiling, camera obstruction, keyboard/mouse/pointer lock, switching without changing player, menu/blur pause, resume, settings, resize, DPR cap, both fallback paths, visible startup failure and screenshots/performance.
- `npm run capture`: the browser evidence test alone, producing nine fixed-state views plus a local rAF performance report. Artifacts go to `artifacts/m1/`, never `public/`.

The browser suite defaults to installed Chrome in headless mode. PowerShell for the visible browser baseline:

```powershell
$env:VOXARRIUM_HEADED = '1'
npm run test:browser
npm run capture
```

Playwright starts/reuses the localhost dev server. It waits for actual physics initialization, GLB bounds/axes/material validation, shader compilation and renderer readiness. The `?test=1` development harness uses the same physics step as gameplay; bookmarks establish known starts, then actual fixed simulation steps traverse obstacles. Separate UI tests use browser keyboard/mouse events and real pointer lock. The blur test dispatches the browser blur event; the fixed-clock test simulates a long timestamp gap. It does not claim an OS sleep/wake soak test.

Captures use scene `m1-human-scale-64m`, seed `104729`, 1440×900 and DPR 1. `capture-states.json` stores each complete serializable state and camera pose. Screenshots: eagle-eye, third-person, first-person doorway, stairs mid-traversal, terrace, first-person bridge, third-person alley, camera obstruction and Blender calibration. Multiple gameplay frames are the M1 traversal evidence; no video was recorded. Determinism means the same simulation/bookmarks on the pinned runtime, not pixel-identical rendering across different GPUs/browsers.

`performance-headed.json`/`performance-headless.json` separate the environments; `performance.json` holds the latest run. Frame intervals are measured from requestAnimationFrame, never labeled GPU time. The baseline covers an idle third-person spawn view after scene warmup, with at least 500 samples. Mesh counts include visibility flags, not frustum-tested objects; draw/triangle counts include shadow passes.

`/?backend=webgl` tests deliberate WebGL2 initialization. A separate browser test masks WebGPU capability in the test page to exercise and record native automatic fallback. The failure test denies both context types in that test page and requires a visible error plus no unhandled rejection. These tests do not modify browser policy or global GPU settings. Expected Chrome warnings (Windows power preference ignored, injected fallback) are retained in test attachments. Successful normal runs must have no console/page errors.

Production was also launched through `npm run preview`, walked with real keyboard input and switched to first person; the development harness was confirmed absent. Local result: `artifacts/m1/production-smoke.json`. See STATUS.md for the actual run results; CI compilation/unit tests alone do not prove browser or gameplay behavior.

## M2 art gate
Compare the master at macro scale and the rural target portion of the Godot comparison at slice scale. Do not treat the earlier 3D attempts as desired output. Review composition/silhouettes, scale, surface language, focal hierarchy, vegetation grouping, water banks and repetition. Use side-by-side/crops only when the camera and scope align. An image diff detects regression to an approved runtime baseline; it does not measure artistic equivalence to the concept image.

Store screenshots/reports under ignored `artifacts/`; retain chosen baselines deliberately. Write findings in `docs/reference/REVIEWS.md`. Human approval is required before city expansion. No fabricated test results or quality scores.

### M2 procedures

`npm run test:browser` now runs the preserved M1 suite at `?scene=m1` and the separate rural browser suite. Rural checks drive one continuous river-to-crop route in both gameplay modes, capture the inspection bookmarks, record idle frame statistics, and independently initialize WebGL2. `npm test` also covers actual rural Rapier stairs/banks/obstacles and actual GLTFLoader hero imports. Asset tests check four cottage elevations by ray intersection and bridge deck height/longitudinal axis; screenshots are still needed to judge art.

`npm run capture` records M2. Set `VOXARRIUM_HEADED=1` for the headed baseline. `VOXARRIUM_STAGE=blockout` selects the composition massing and writes `artifacts/m2/blockout/`; normal detailed captures use `artifacts/m2/final/`. The eagle-eye reference image is 900×1200, DPR 1; gameplay/idle baseline images are 1440×900, DPR 1. Each exact camera/state is saved in `capture-states.json`. A clean eagle-eye capture hides only DOM overlays for comparison. `npm run capture:m1` retains the original M1 capture command.

M2.1 can set `VOXARRIUM_CAPTURE_DIR` to preserve each comparison iteration separately. The rural capture/browser suite, `measure-rural.mjs` and `smoke-rural-production.mjs` honor that output-only setting. Current review evidence uses `artifacts/m2-1/before/`, `iteration-01/`, `iteration-02/`, `iteration-03/` and `final/`; `artifacts/m2-1/review.html` presents the original LEFT rural target with selectable before/after gameplay views. Camera bookmarks, seed, viewport and simulation behavior are unchanged by that setting. Artifact files are ignored and outside shipped public assets.

With the dev server running and art files stable, `node tools/measure-rural.mjs` runs a bounded 60-second headed Chrome route at 1920×1080/DPR 1. It uses actual W input, steers toward authored waypoints, measures rAF intervals plus five-second diagnostics, and saves aggregate frame statistics in `performance-route-60s.json`. The final run reached the crop terrace and returned as far as the cottage's east side; it did not finish the entire out-and-back route in one minute. The separate deterministic route tests verify the complete outward traversal in both gameplay modes. This minute-long distribution differs from the 600-frame rolling idle overlay. JS heap, when exposed by Chrome, is not VRAM. Dev-server reloads invalidate evidence runs; rerun once the source is stable rather than treating a reload-induced harness removal as a gameplay result.

After `npm run build` and with `npm run preview` serving port 4173, run `node tools/smoke-rural-production.mjs`. It checks actual keyboard movement, pointer lock, V switching, absence of the development harness even with `?test=1`, and zero browser errors. The report and screenshot are saved under `artifacts/m2/final/`. Water evidence uses the same camera at simulation times zero and six seconds (`water-time-0.png`, `water-time-6.png`) to verify visible current/highlight movement. No traversal video or GPU execution-time measurement is claimed.
