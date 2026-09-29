# Testing and visual review

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
