# Voxarrium status

## Current milestone

**M1 implementation complete — stopped at the owner review gate.** Executed locally on 2026-09-28 (America/Los_Angeles; artifact timestamps use 2026-09-29 UTC). M2 has not started. The explicit M1 goal superseded the earlier M0 review hold; M0 history remains in commit `3703b7d`.

Initial checkout was clean on `milestone/m1-human-scale-foundation`, HEAD `3703b7d`. Work stayed on that branch. Two bounded native children owned renderer/diagnostics and player/course/cameras; parent owned contracts, dependencies, integration, testing and this report. No recursive delegation.

## Play locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ and click **Enter the course**. WASD moves, mouse looks, Shift runs, Space jumps, V switches third/first person, R resets, Esc pauses/releases the mouse. Keys 1–4 select third-person, first-person, free/debug and eagle-eye. Free camera uses Q/E vertically. Pause settings expose FOV and sensitivity. `/?backend=webgl` explicitly selects WebGL 2. `npm run build` then `npm run preview` serves the production build on port 4173.

## Implemented scope

- TypeScript + Vite + vanilla Three.js, DOM UI and Rapier, with exact dependency pins and a real npm lockfile. Serializable simulation state is separate from rendering, physics, input, cameras and diagnostics.
- Deterministic authored 64 × 64 m course: scene `m1-human-scale-64m`, seed `104729`. Ground, 14° and 53° slopes, eight actual 0.17 m risers/0.30 m treads, 1.10 m doorway, 2.10 m alley, 1.55 m blocked clearance, 2.05 m passable headroom, bridge, wall, 1.36 m terrace, water-height placeholder and recoverable drop.
- One 1.75 m capsule with radius 0.30 m: walk 2.6 m/s, run 5.4 m/s, acceleration/deceleration, jump/gravity, ground snap, stair autostep, 45° slope threshold, steep-face sliding, collision and recovery. Dimensions are design assumptions, not measurements from concept art.
- Third-person default with camera sphere casts, immediate inward correction and eased outward recovery. First-person eye at 1.62 m shares the same player/physics. Free/debug and deterministic eagle-eye cameras. Close-wall retraction hides only the obstructing diagnostic avatar.
- 60 Hz fixed simulation, interpolated rendering, six-step catch-up cap, pause/blur clearing, pointer lock/release, resize and DPR cap 2. No head bob.
- Awaited renderer initialization, GLB validation and shader warmup; actual backend/fallback reporting and visible startup/runtime errors. Simple sky, sun/fill, shadows and color management. Diagnostic overlay and development-only fixed-step capture harness.

## Checks actually run

| Command / check | Result | Scope / evidence |
| --- | --- | --- |
| Registry queries, official docs and installed APIs | PASS | Three 0.186.1, Three typings 0.186.0, Rapier compat 0.21.0, TS 7.0.2, Vite 8.3.1, Playwright 1.63.0, Node typings 26.6.3. See docs/SOURCES.md and docs/DECISIONS.md. |
| `npm ci` | PASS | Clean installation from new lockfile; 31 packages added, 0 reported vulnerabilities. Node 22.16.0, npm 10.9.2. |
| `npm test` | PASS | 9/9 Node reference/contracts tests + 17/17 simulation/fixture/clock tests. Actual Rapier stepping; GLTFLoader dimensions/axes/colors; suspension cap. |
| `npm run typecheck` | PASS | Strict runtime, tests and configs; also executed by check/build. |
| `npm run check` | PASS | Repository contracts, tool syntax, vendored GLB checksum and TypeScript. |
| `npm run build` | PASS | Real Vite production bundle; chunk-size advisory remains. |
| `npm run test:browser` | PASS | 10/10 in installed Chrome, both headless and headed runs. Final full headed report: artifacts/m1/browser-suite.json. Unit report: artifacts/m1/simulation-suite.json. |
| `$env:VOXARRIUM_HEADED='1'; npm run capture` | PASS | Nine deterministic reference/gameplay/calibration views, exact states and headed performance report. |
| Production preview / headed Chrome smoke | PASS | Built runtime launched at port 4173, walked using W, switched using V; no page/console errors. Development harness absent even with ?test=1. artifacts/m1/production-smoke.json. |
| `npm run references:verify` | PASS | All four original PNG signatures/bytes/dimensions/hashes match unchanged manifest. |
| `npm run doctor` | PASS | Local Node/Git/Blender/references. Doctor explicitly does not claim browser validation; now reports runtime source present. |
| `npm run blender:fixture` | PASS | Blender 5.2.1 LTS, isolated factory background export; current cube/axis GLB vendored and tested in runtime. |
| `git diff --check` | PASS | Local whitespace/diff audit. Hosted CI has not been run for this local task. |

Browser tests traverse slopes, stairs, doorway, alley, bridge, wall, low opening and valid headroom in **both** gameplay modes. They check run/jump/fall recovery, unchanged player on view switching, camera obstruction/recovery, actual keyboard/mouse/pointer lock, Escape pause/re-entry, blur input clearing, FOV persistence, free camera, resize and a DPR 3 context capped to 2. Normal runs require zero console/page errors.

The blur test dispatches a browser blur event; long suspension is also tested with synthetic clock timestamps. This is not an OS sleep/wake soak test. Multiple gameplay screenshots provide traversal evidence; no video was recorded.

## Renderer and local performance

Normal initialized backend: **WebGPU**, read from the actual Three r186 backend and GPU device. Device adapter info exposes `amd / rdna-2`, with precise model fields blank. Independent Windows inventory identifies **AMD Radeon RX 6950 XT**, driver `32.0.21045.5002`, status OK. The initialized WebGL2 context also identifies that GPU through ANGLE/D3D11.

Explicit WebGL2 initialization passes readiness and stairs traversal. A separate test masks WebGPU in its own page: native automatic fallback initializes WebGL2 and records `WebGPU initialization failed: TypeError: Cannot read properties of undefined (reading 'requestAdapter')`. Denying both contexts in another test gives a visible startup error with no unhandled rejection. These injections do not alter browser policy or global GPU settings.

Headed baseline: Chrome **154.0.8037.57**, Windows, WebGPU, **1440 × 900**, **DPR 1**. Third-person spawn after warmup, at least 500 frames: approximately **144 FPS**, mean **6.94 ms**, median **6.90 ms**, p95 approximately **7.1 ms**. Exact latest sample: `artifacts/m1/performance-headed.json`; headless results are kept separately. This measures requestAnimationFrame wall-clock intervals with automation/dev server active, **not GPU execution time**, and proves no city-scale performance claim.

At that view: **78 draw calls, 1,603 submitted triangles, 9 geometries, 14 textures, 38 meshes with visible flags, 45 top-level scene children**. Draw/triangle counts include shadow passes; mesh counts are not frustum visibility counts.

## Blender runtime calibration

Vendored `public/assets/diagnostics/scale-fixture.glb`: **7,244 bytes**, SHA-256 `f8d039ca52cb3fef37a92349b19751c5e8c022a320fd81e5b1ada3d392fc4677`. Provenance/counts/collision policy in `assets/manifest.json`. Four materials, no textures, 48 triangles. Normal startup needs no Blender.

Actual browser GLTFLoader import before placement: cube bounds `[-0.5,0,-0.5]` to `[0.5,1,0.5]`, dimensions 1 m on all axes (tolerance 0.0001 m). Asymmetric marker centers verify Blender +X → runtime +X `(1.5,0,0)`, Blender +Y → runtime -Z `(0,0,-1.5)`, Blender +Z → runtime +Y `(0,1.5,0)`. Original GLB materials remain in use; RGB dominance and visible colored markers were checked. No extra rotation/scale correction. Cube placed at `(-4,0,10)` with a separate 1 m collision proxy.

Browser inspection caught an initial export issue: Blender display colors alone exported gray. The generator now sets Principled Base Color; runtime validation and regression tests reject gray axes. A symmetric cube alone is no longer used as complete orientation evidence.

## Captures inspected

All artifacts remain outside production assets under ignored `artifacts/m1/`:

- `eagle-eye.png`: whole course, banks, bridge and connected geometry.
- `third-person.png`: default human-scale player/follow view.
- `first-person.png`: doorway at eye height, with stairs beyond.
- `stairs-traversal.png`, `terrace.png`, `alley-traversal.png`, `bridge-traversal.png`: actual stepped gameplay states.
- `camera-obstruction.png`: camera stays outside wall and close avatar no longer fills the view.
- `blender-calibration.png`: one-meter cube and imported RGB markers.
- `webgl-fallback.png`: deliberate fallback rendering.
- `capture-states.json`, `traversal-third-person.json`, `traversal-first-person.json`: exact states and traversal endpoints.

Views were opened and visually inspected. They demonstrate M1 scale/geometry behavior, not an M2 artistic match or owner approval.

## Limitations and next action

**No M1 completion blocker remains.** Movement feel and scale still require owner review. The avatar and materials are diagnostic. The production JS is about 5.21 MB minified/1.91 MB gzip; Vite's chunk-size advisory remains for future measured loading work. Chrome warns powerPreference is ignored on Windows; actual device reporting is unaffected. Blender 5.2 warns that use_nodes is deprecated for 6.0; the current export succeeds.

No city, cottage, generated buildings, NPCs, vegetation, weather, day/night, audio, paid APIs/services, Jev, image generation, public deployment, model/provider/global Codex changes or source-image mutation was introduced. CI now installs the lockfile and runs unit/check/build/reference validation, but no hosted result is claimed.

**Next action: owner plays/reviews M1 and its three camera captures. Stop here; do not begin M2 automatically.**
