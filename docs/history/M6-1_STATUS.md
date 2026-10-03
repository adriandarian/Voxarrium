# Voxarrium status

## Current milestone and gate

**M6.1 implementation and local evidence are complete and stopped at human review. M7 has not begun.** The bounded objective is city blueprint convergence toward the master composition, without production district generation. Human artistic acceptance remains pending. Work performed 2026-10-01, America/Los_Angeles. [M6.1 objective](docs/prompts/06-1-city-convergence.md) retains the user request; [preserved M6 STATUS](docs/history/M6_STATUS.md) retains the earlier report and measured timings.

Initial preflight was clean on `milestone/m6-city-blueprint`, HEAD `f477f6960ae2d291cb6690b1e4d6e7c703b85b78` (`feat: complete M6 city blueprint review build`). M6.1 was performed serially. Changes remain local and uncommitted. No dependencies/providers/global configuration, image generation, asset purchase, Blender export, remote runtime AI, deployment, push, PR or merge were added.

## Delivered layout and preservation

[CITY_BLUEPRINT](docs/CITY_BLUEPRINT.md) documents source observations, authored assumptions, the district table and unchanged Mermaid graph. Plain serializable meter data remains separate from render/physics objects.

- **Core compression:** 620×708 → **545×708 m**, x −160..385, z −660..48. Civic fills its western void, noble extends north to z −570, temple/lower canal move toward the shared river, and core boundaries join as continuous terraces. The meter origin, north −Z and 50 m citadel top stay fixed.
- **Connective terrain:** seven accessible intermediate levels add a western retaining quarter, civic stair quarter, inhabited quay, east-bank street, bank garden, noble stair quarter and citadel gate terrace. Eighteen grouped surfaces contain eleven main district tops plus seven clipped tiers. Twelve terrain elevations: 4, 8, 12, 18, 20, 22, 30, 32, 36, 40, 44 and 50 m. Each tier has an existing owner and tested access road.
- **Citadel/retaining hierarchy:** six towers, staggered keep/courtyard wings, five perimeter wall masses, two piers around a 44 m gate terrace, a 9 m ascent and three upper-city support masses strengthen the skyline. Thirty resident landmark/structural bodies include civic buttresses and an embedded gate. Renderer and Rapier share `cityRetainingSurface`: sides end at adjacent street/terrace support; coplanar seams disappear. Stair cuts and intermediate tiers interrupt selected long walls. Remaining plain canal faces stay exposed.
- **Circulation:** 37 road records, up from 26, add eleven stair/lane/plaza/retaining/quay routes. Four secondary portals reuse existing neighbors: **all 14 IDs and 17 unique adjacency edges remain unchanged**, with 21 gated connections. Five bridge-class records yield seven clipped water-crossing spans. Generated controller grades remain ≤1:5; 406 visible treads rise ≤0.17 m over smooth support. No jump is required on tested paths.
- **Water:** five endpoint-connected reaches retain the accepted −1.16 m datum. Middle/upper/headwater widths tighten from 18/16/14 to **12 m**; accepted and southern widths remain. The incised valley, numerical heights, unseen streets and northern inlet are design assumptions, not measurements from pixels.
- **Density:** 88 aggregate block bodies plus 88 roof boxes, up from 62 bodies, improve street walls and connector occupation. Full footprint/corner/corridor checks reject unsupported or overlapping candidates. These remain blueprint proxies; no production building generator, final citadel asset, interiors or new gameplay system was added.

Accepted rural, River Market and workshop courses remain exact data matches, including their buildings, stairs, quays, bridges and navigation anchors. All four original image hashes and five shipped GLB checksums pass. Forty-two accepted NPC identities remain; new districts add none. Reference pixels remain outside shipped assets. The original canonical eagle-eye is unchanged and remains an art/debug camera; gameplay stays human-scale third-person with the same-world first-person option.

## Traversal, streaming and inventory

The existing two-detail-lease/transport bound, preparation scheduler, abort epochs, resource cache, compile/shadow warmup, disabled collider preparation and collision-before-visibility activation remain unchanged. City graph demand, 2 m portal clearance and 1.5 s graph-departure retirement retain M6's lifecycle; the M5 corridor keeps its 36/44/46 m spatial policy. Overview silhouettes do not activate all districts or expand NPC residency, and duplicate active-area proxies are suppressed.

Simulation independently walks the continuous rural-to-citadel spine in both gameplay modes without jumps, setup teleports or recovery. It also traverses **all 37 authored paths in each mode**, including stairs, alleys, plaza loops and secondary bridges: one explicit setup reset per isolated path, zero recovery during its legs. Actual grades, terrain/water exclusions, supported massing/ordinary landmark corners, retaining collision, grounding and camera clearance are checked. Embedded structural foundations remain intentional retaining masses.

Captured native WebGPU traversal starts at natural rural spawn and completes **33 arrivals through ten active IDs**: rural, River Market, workshop, south gate, garden, central market, civic, temple, upper city and citadel. Final grounded position **(149.98,50.02,−605.02)**; zero recovery resets, ≤2 loaded detail leases, 42 unique NPCs and zero route runtime errors. Explicit initialized **WebGL2 repeats the whole spine in first-person**, reaching the same endpoint. Fixed-step routes prove geometry/lifecycle, not realtime cadence.

Standalone overview: **28 visible draw objects / 115,783 authored triangles**, 30 geometries / 21 materials / 20 instance buffers / zero textures before labels. Canonical captured city component with rural active: **26 draw objects / 114,599 triangles**, suppressing active-area duplicates. These are component inventories, not whole-game main/shadow totals or production budgets. Resident topology has **662 colliders**; route endpoint has **689 total / one body**, including upper detail and 19 remaining safety guards. Greater density increases geometry/collider inventory; no frame-time improvement is claimed.

## Exact verification

- `npm test`: **PASS, 9 Node bootstrap + 118 simulation = 127 checks**. Complete simulation run: 94.9 s, no retries/skips/unexpected failures. `artifacts/m6.1/simulation-suite.json` includes determinism/serialization, exact accepted courses, graph/water references, all paths in both modes, slopes, retaining support, floor corners, disposal and two-lease lifecycle.
- `$env:VOXARRIUM_HEADED='1'; $env:VOXARRIUM_CITY_EVIDENCE='artifacts/m6.1/browser'; npm run test:browser`: **PASS, 37/37**, complete headed run, 710.6 s, zero retries/skips/flaky/unexpected cases. Existing runtime/rural/living/district/streaming and both city backend cases pass. Report: `artifacts/m6.1/browser-suite.json`. Negative backend/missing-asset tests intentionally exercise failure reporting; city routes report zero errors.
- `npx playwright test --project=simulation tests/city-convergence.spec.ts --grep M6.1`: **PASS, 1/1**, after metadata-only corrections to elevation bands, owned landmark references and serialized assumptions; `artifacts/m6.1/metadata-check.json`.
- `$env:VOXARRIUM_CITY_EVIDENCE='artifacts/m6.1/browser'; npx playwright test --project=city-browser`: **PASS, 2/2**, final native WebGPU/explicit WebGL2 capture and complete-route refresh after metadata fixes. Headless Chrome; exact duration in `artifacts/m6.1/city-refresh-suite.json`. Geometry matches the full headed run.
- `npm run check`: **PASS**, repository/tool contracts, five shipped GLB checksums and strict typecheck.
- `npm run build`: **PASS**, 61 Vite modules; main JS **5,544.73 kB minified / 2,025.57 kB gzip**. Existing >500 kB chunk advisory remains.
- `npm run references:verify`: **PASS**, four original hashes.
- `npm run doctor`: **PASS** local readiness, Node 22.16.0, Git 2.39.2.windows.1, Blender 5.2.1 LTS. Doctor does not prove gameplay or export a new asset.
- Built preview: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173`, then `$env:VOXARRIUM_PRODUCTION_CAPTURE_DIR='artifacts/m6.1/production'; $env:VOXARRIUM_PRODUCTION_SCENE='m6'; node tools/smoke-streaming-production.mjs`: **PASS**, actual W moves **3.125 m**, V selects first-person, Esc/menu selects rain/night, pointer capture, 42 locals, zero errors, no development harness or city overlay controls. Screenshot/report under `artifacts/m6.1/production/`. Preview stopped. An initial PowerShell/npm launcher dropped forwarded flags; direct local Vite CLI resolved that launcher issue.

- `node tools/review-city-convergence.mjs`: **PASS**, assembles 18 runtime captures from passing reports, validates both complete route ledgers and exact canonical-camera equality against M6.
- Gallery delivery check in headless Chrome 154.0.8037.92: **PASS**, all 19 initially displayed images decode, all 37 unique local links return HTTP 200, the preserved-M6/current-M6.1 toggle works and zero page/console errors occur. Report: `artifacts/m6.1/gallery-verification.json`; gallery overview screenshot actually opened. The local review server remains on `http://127.0.0.1:5173/artifacts/m6.1/review.html`.
- `git diff --check`: **PASS**. Existing Git CRLF-to-LF notices are line-ending normalization notices, with no whitespace errors.

No hosted CI, new hardware inventory, video, physical presentation timing or exclusive M6.1 frame benchmark is claimed. Historical M6 readiness misses and frame-tail findings remain in [performance budgets](docs/PERFORMANCE_BUDGETS.md) and preserved M6 STATUS; layout convergence has not established their resolution.

## Actual evidence and master comparison

[Review gallery](artifacts/m6.1/review.html) is assembled from completed reports by `node tools/review-city-convergence.mjs`. Raw capture states/routes live under `artifacts/m6.1/browser/`; compact facts in `artifacts/m6.1/evidence-summary.json`. Artifacts are local ignored outputs; the assembly tool and docs are tracked changes. The previous canonical image is preserved at `artifacts/m6.1/baseline/master-eagle-eye.png`.

Actually opened the original master, previous and new eagle-eye side by side, final labeled map, citadel/lower-city composition, water network and all six street images. Required fresh evidence:

- `master-eagle-eye.png`: **(−250,950,900)** → **(120,18,−300)**, FOV50°, **900×1500 / DPR1**. Assembler verifies camera pose/quaternion/projection, viewport, seed and environment exactly match M6.
- `district-map.png`: labeled IDs/boundaries, **1600×1800 / DPR1**; `streaming-graph.png` is separate.
- `castle-lower-city.png`: elevated central/lower-city view toward the skyline; `citadel-debug.png` exposes courts/perimeter from another angle.
- `waterway-network.png` / `water-network.png`: connected network with emphasis, plus a second bank/elevation angle.
- `street-1-third-person.png` / `street-1-first-person.png`: central market **(110,12,−235)**.
- `street-2-third-person.png` / `street-2-first-person.png`: civic bridge approach **(180,22,−385)**.
- `street-3-third-person.png` / `street-3-first-person.png`: upper gate **(185,40,−550)**. Street pairs are **1440×900 / DPR1**, reached through continuous movement rather than setup teleports.
- `webgl2-first-person.png`: fallback at the citadel endpoint; four local debug cameras and an unlabelled top-down view supplement review. **18 runtime PNGs total**, plus master and preserved M6 in the gallery; production smoke is separate.

All city captures: seed 104729, clear/day. Final metadata refresh records HeadlessChrome/154.0.0.0, initialized native WebGPU AMD/RDNA2; explicit WebGL2 is separately tested. The complete 37-case suite and production smoke used headed Chrome. Exact backend/player/camera/environment states remain in JSON. No numerical fidelity score is made.

Three largest remaining macro differences, after direct comparison with the original master:

1. **Urban grain/open space:** fewer, larger aggregate roof clusters and broad courts remain more open than the reference. Fixed southern anchors and the wide garden transition still read separately from its continuous urban fabric.
2. **Waterbank/elevation:** the retained −1.16 m datum creates deep incised retaining faces. New quays/tiers/stairs help, but bank buildings, substantial bridge openings and planted slopes remain less closely interlocked. Long uncovered canal faces remain visible.
3. **Upper platform/citadel:** six towers and staggered support masses strengthen the skyline, but broad rectilinear platforms and simple court/perimeter volumes still simplify the reference's asymmetric vertical stacking and monumental transition.

These qualitative findings are also recorded in [reference review](docs/reference/REVIEWS.md). Final decoration, fog or post-processing has not concealed the blockout limits. **Stop at M6.1 human review. M7 and production district generation require separate explicit authorization.**
