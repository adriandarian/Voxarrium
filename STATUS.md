# Voxarrium status

## Current milestone

**M2 implementation and evidence are ready for human art review. M2 artistic completion is NOT declared.** Work performed locally on 2026-09-28 (America/Los_Angeles; artifact timestamps use 2026-09-29 UTC). No M3 work has started. The explicit M2 objective authorized progression from M1; the preceding M1 report remains in Git history at `d6fd19e98ada48a50cbc0cc6f4f18347aa3ebb00`.

Initial checkout was clean on `milestone/m2-reference-art-slice`, HEAD `d6fd19e98ada48a50cbc0cc6f4f18347aa3ebb00`; STATUS confirmed M1 complete. Work stayed on that branch. Two bounded native children owned Blender hero production and runtime terrain/vegetation; parent owned interfaces, scale/palette, integration, manifest, tests, final review and this report. No recursive delegation. Changes are local and uncommitted; no remote CI, push or deployment is claimed.

## Mouse capture compatibility follow-up — 2026-09-28

Owner reported Chromium's mouse-capture failure in the Codex in-app browser. The original entry flow made successful pointer lock mandatory, leaving the game paused on a browser rejection. Standalone Chrome validation had not established this embedded-browser behavior.

Fixed entry to focus the canvas, verify actual capture, and fall back to left-button drag look when capture is rejected, missing or resolves without acquiring a lock. The HUD explains the active look control; WASD and both gameplay cameras remain available. Fallback persists for the page session, avoiding repeated capture attempts. Escape, blur, pointer release/cancel and disposal clear drag/keys; a late capture result cannot resume after pause/focus loss. Start requests are guarded while pending.

Actual in-app verification: started via the focused button, observed the menu close and fallback hint, switched to first person, dragged to visibly turn the camera, paused with Escape and resumed in third person. No captured console errors. Evidence: `artifacts/input-fallback/in-app-drag-look.png`. This fixes application compatibility; native mouse capture itself remains unavailable in this host. Automated in-app click activation was unreliable during inspection, so the focused start button was activated with Enter; drag input itself worked.

Checks run for this follow-up: `npm test` PASS (9 + 27); `npm run check` PASS; `npm run build` PASS; `$env:VOXARRIUM_HEADED='1'; npx playwright test --project=browser --grep 'mouse capture|delayed capture|pointer lock'` PASS (5/5); `git diff --check` PASS. The focused headed tests cover native capture plus rejection/missing/false-success fallback, real W movement, drag in both gameplay modes, mouse release, Escape, blur/resume and delayed rejection after blur. Report: `artifacts/input-fallback/browser-suite.json`. The full 14-test M2 run below predates this focused follow-up; it was not rerun or relabeled. Art acceptance is still pending.

## Play locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ and click **Explore the garden**. WASD moves, mouse looks, Shift runs, Space jumps, V switches third/first person, R resets, Esc pauses/releases the mouse. Keys 1–4 select third-person, first-person, free/debug and eagle-eye. Free camera uses Q/E vertically. Pause settings expose FOV and sensitivity. `/?backend=webgl` explicitly selects WebGL2. `/?scene=m1` retains the complete diagnostic course. `/?stage=blockout` retains rural composition massing. `npm run build` then `npm run preview` serves production on port 4173.

## Implemented slice

- Authored 96 × 96 m rural scene `m2-rural-96m`, seed `104729`: cottage terrace at 4 m, crop terrace around 7.4 m, irregular lower banks, turquoise river, two stair runs, connected winding paths, 14 m bridge, garden beds, upper wheat field and teal-roof shed. Dimensions and unseen elevations are coherent human-scale assumptions, not recovered measurements from one image.
- Original local Blender cottage, shed and bridge with editable `.blend`, retained export report and hashed GLBs. Cottage has four elevations, thick tiled roof/eaves, recessed windows, dimensional closed doors, timber, stone foundation, chimney and barrels. Bridge has rails, deck, trestles and underside. Original material colors import directly, without corrective runtime scaling/rotation.
- Shared render/physics terrain triangle surfaces and explicit collision proxies for buildings, stairs, bridge, trees, fences and beds. M1 capsule, Rapier locomotion, fixed simulation, input, cameras, disposal, diagnostics and development capture harness remain in use. Cottage threshold was lowered into alignment with the terrace so its first step is within controller limits.
- Runtime vegetation library with three tree silhouettes, shrubs, fern, short/tall grass, reeds, white/yellow flowers, weeds and wheat. Seeded ecological patches exclude paths, structures and stairs; agricultural rows remain deliberate. 24 trees and 17,781 total instances in 20 instanced meshes, including water highlights. Decorative plants/stone veneers do not collide.
- Irregular layered cliff geometry, authored shore depth colors, shallow animated water geometry and muted moving highlights. Four deterministic 512 × 512 pigment maps add grass/soil/path/stone variation without sampling source images. Warm sun, soft fill, shadows and existing tone/color handling. No fog, bloom, DOF or weather conceals geometry.
- Asset provenance, bounds, counts, original reference hashes, collision and LOD policies are retained in `assets/manifest.json` and `assets/source/rural-hero.report.json`. Runtime does not require Blender.

## Art review result and outstanding gate

The implementation removes the previous attempt's universal ground grid and adds real all-side architecture, clustered ecology, connected terrain and a playable bridge/stair/cottage/crop circuit. The cottage/garden/upper field/shed/river relationships follow the rural target. This establishes progress, **not evidence that the entire scene is already demonstrably much closer than every prior experiment**. No numerical similarity score or owner approval is invented.

Three largest remaining visual differences, observed in actual final captures:

1. **Vegetation silhouette and repetition.** Three tree forms exist, but repeated scalloped leaf bunches and round shrubs remain apparent. The reference has more varied branch exposure, angular leaf clusters, density and edge breakup; ground-level grass still reads as repeated blades in places.
2. **Terrain, bank and path integration.** Broad clean stairs and smooth pale path ribbons are more engineered than the reference. The lower bank tongue is less sculpted/elevated, the water surface is simpler, and repeated cliff joints are still visible. The finite slice's open outer boundaries remain visible without fog.
3. **Surface richness and scale of detail.** The cottage is dimensional from every side, but timber/plaster/stone remain comparatively pristine; material transitions and local contact detail lack the target's painterly variation. Larger broad green areas and simplified terrace edges reduce reference density.

`docs/reference/REVIEWS.md` records blockout corrections, rejected detail passes, seam/threshold fixes and the final three-camera assessment. Visual differences remain substantive enough that the M2 reference-quality acceptance is **pending**, despite passing technical checks. Owner should review the final captures and playable slice and choose focused M2 revisions or explicit art acceptance. **Stop at this human review gate; do not begin M3 or expand the city.**

## Checks actually run

| Command / check | Result | Scope / evidence |
| --- | --- | --- |
| `npm test` | PASS | 9 Node reference/contracts tests + 27 simulation/asset/clock tests. Actual Rapier stepping and GLTFLoader imports; rural stairs up/down, bridge, inspection bookmarks, cottage perimeter and threshold; four-elevation ray tests. `artifacts/m2/simulation-suite.json`. |
| `npm run check` | PASS | Repository contracts, all vendored GLB checksums, tool syntax and strict TypeScript. Repeated after final documentation/manifest updates. |
| `npm run build` | PASS | Actual Vite production bundle; chunk-size advisory remains. |
| `$env:VOXARRIUM_HEADED='1'; npm run test:browser` | PASS | 14/14 installed Chrome tests: preserved 10 M1 tests plus 4 rural tests. `artifacts/m2/browser-suite.json`. |
| `$env:VOXARRIUM_HEADED='1'; npm run capture` | PASS | Final M2 reference/gameplay/close-range captures, exact states, timed water pair and idle frame baseline. Final full browser run also recaptured evidence. |
| `node tools/measure-rural.mjs` | PASS | 60-second headed 1080p route, actual W input and waypoint steering, zero console/page errors, no unexpected recovery/pause. |
| `node tools/smoke-rural-production.mjs` | PASS | Built preview on port 4173: actual keyboard movement 3.09 m, pointer lock, V switch to first person, zero browser errors, development harness absent even with `?test=1`. |
| `npm run references:verify` | PASS | All four original PNG signatures, bytes, dimensions and SHA-256 hashes unchanged. |
| `npm run doctor` | PASS | Node 22.16.0, Git 2.39.2, Blender 5.2.1 LTS and reference diagnostics. Doctor is not a GPU/gameplay test. |
| `npm run blender:fixture` | PASS | Isolated local Blender calibration export. Vendored M1 calibration asset unchanged. |
| `node tools/blender-rural.mjs` (`npm run blender:rural`) | PASS | Actual isolated Blender export, GLB/report validation; final plaster seam correction re-exported and inspected in runtime. |
| `git diff --check` | PASS | Final local whitespace audit. No hosted check result claimed. |

Rural route tests establish one initial starting pose, then continuously cross the bridge, climb the cottage stairs, walk front/east/rear, and ascend the crop terrace using the same physics in both gameplay cameras. They do not teleport between obstacles. The preserved M1 suite covers slope limits, doorway/alley/headroom, jump/run/recovery, camera obstruction, actual keyboard/mouse/pointer lock, pause/blur/settings/resize/DPR and failure/fallback paths. The blur check dispatches an event; this is not an OS sleep/wake soak. No traversal video was recorded.

An earlier browser run was invalidated by Vite reloading during an edit; after diagnosis, the complete final suite ran against stable source and passed. Evidence was not inferred from exports or compile checks.

## Renderer and measured local performance

Chrome **154.0.8037.57**, headed, Windows, initialized **WebGPU**, actual device exposes **AMD / RDNA2** (precise model fields blank). Live Windows inventory separately reports **AMD Radeon RX 6950 XT**, driver **32.0.21045.5002**, status OK. Rural explicit WebGL2 initialization and bridge traversal also pass. Preserved M1 automatic WebGPU fallback and visible startup-failure injection tests pass separately.

| Measurement | Idle spawn | Real-time traversal |
| --- | --- | --- |
| Viewport / DPR | 1440 × 900 / 1 | 1920 × 1080 / 1 |
| Samples / duration | 502 warmed frames | 8,643 frames / 60.023 seconds |
| Mean / approximate FPS | 6.934 ms / 144.22 FPS | 6.944 ms / 144.01 FPS |
| Median / p95 / maximum | 6.90 / 7.00 / 7.40 ms | 6.90 / 7.00 / 8.00 ms |
| Draw calls / triangles at recorded view | 231 / 7,086,105 | 227 / 6,465,695 at route end |
| Visible-flag meshes / top-level scene objects | 140 / 63 | 140 / 63 |
| Instanced meshes / instances | 20 / 17,781 | 20 / 17,781 |
| Geometries / textures / visible materials | 95 / 11 / 61 | 95 / 11 / 61 |

Scope: requestAnimationFrame wall-clock intervals with local dev server and browser automation, **not GPU execution time or an uncapped throughput claim**. Submitted triangle/draw counts include shadow passes; visible-flag mesh counts are not frustum counts. The one-minute walk reached the crop terrace and returned to the cottage east side (14 waypoints reached); it did not complete the whole planned return to the far bank within one minute. Zero frames exceeded 33.3 ms in this run. Initial setup uses one intentional teleport; there were no recovery resets. Complete outward traversal is separately covered by the route tests.

Reported Chrome JS heap was **122,692,941 bytes used / 166,569,593 allocated** at the minute's end; this is not VRAM or total process memory. Exact reports: `artifacts/m2/final/performance-headed.json`, `performance-route-60s.json`, `production-smoke.json`. These measurements establish this machine and this slice only, not city-scale or lower-end-device performance.

## Actual captures inspected

Local artifacts are ignored, outside shipped assets. `artifacts/m2/blockout/` retains composition evidence; `artifacts/m2/review-02/` retains the rejected intermediate detailed pass. Final evidence is under `artifacts/m2/final/`:

- `eagle-eye-clean.png` and `eagle-eye.png`: 900 × 1200, DPR 1, same full 3D world; clean version hides DOM overlays only.
- `third-person.png`, `first-person.png`, `cottage-rear.png`, `cottage-east.png`, `cottage-west.png`: 1440 × 900 human-scale views of all cottage elevations, roof/eaves and openings.
- `bridge.png`, `riverbank.png`, `stairs.png`, `garden.png`, `route-third-person-crop.png`, `route-first-person-crop.png`: approaches, bank transitions and traversal endpoints.
- `water-time-0.png`, `water-time-6.png`: same camera, six simulated seconds apart, inspected for visibly moving highlights.
- `webgl-fallback.png`, `production-smoke.png`, `performance-route-end.png`: separate backend, built runtime and measured route evidence.
- `capture-states.json`, `route-third-person.json`, `route-first-person.json`: exact deterministic poses, states and route checkpoints.

## Remaining engineering limits

No failing technical check remains. The diagnostic capsule is still the M1 avatar; no character art/animation was in scope. Closed cottage doors intentionally block entry; only believable window/door recesses are modeled, not an explorable interior. Small decorative vegetation is noncolliding. No distance LOD or city streaming has been introduced.

Production JavaScript is **5,255.84 kB minified / 1,929.59 kB gzip**; the existing Vite chunk advisory remains for later measured loading work. Browser warns Windows ignores powerPreference; actual backend/device reporting is retained. Blender warns use_nodes will change in version 6.0; current local export succeeds. No paid service, external model call, image generation, source-image mutation, Jev, weather, NPC, audio, city expansion or remote deployment was introduced.
