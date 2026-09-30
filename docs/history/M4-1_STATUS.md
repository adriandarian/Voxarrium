# Voxarrium status

## Current milestone and gate

**M4.1 River Market urban art convergence is implemented and locally validated. Stop at the human-review gate. Artistic acceptance is pending; do not begin M5, expand the map or generate the full city.** Work performed 2026-09-30, America/Los_Angeles. Objective: `docs/prompts/04-1-urban-art-convergence.md`. The owner establishes technical acceptance of M4 and requests this bounded artistic follow-up.

Preflight was clean on `milestone/m4-first-district`, HEAD `12fbbab3e159b0422c3738979cd28da50be153cb`. Changes remain local and uncommitted. Work was serial, without subagents, dependency/provider/global configuration changes, image generation, asset purchases, remote deployment, push/PR or merge. The earlier M4 implementation and evidence remain in Git history and `artifacts/m4/`; no human art approval is invented.

## Visual changes and preserved scope

- **Facades:** six authored elevation profiles over the existing six archetypes vary narrow/tall/wide/paired openings, sill heights, bay spacing and utility-wall omissions. Separate hinge-origin shutter leaves allow folded, angled and drawn states. Awnings vary width/depth/offset and cloth palette; signs alternate placement/proportions; balconies shift and resize. Existing varied plaster/roof palettes and all-side dimensional geometry remain. Building footprints, floor heights, roof forms and the raised guild-hall massing are preserved.
- **Ground:** worn staggered stone ribbons, authored plaza wear/value patches, facade/work aprons, low edge courses, dark drain channels and selected grates replace undifferentiated walking washes. Chipped corners and subtle joints soften the initial grid-like iteration. Detail stays on selected streets/aprons rather than uniformly tiling every ground surface; veneers rise at most 7.3 cm over the unchanged terrain/collision.
- **Market:** the same four sites now carry bakery, pottery, produce and textile displays, with modest counter/canopy proportion differences, grouped stock stacks and baskets. Two benches provide edge gathering points. Counter proxies follow the revised dimensions. Stall keepers, routes and timings stay intact; the central crossing remains clear.
- **Alleys:** side-wall service casks/baskets/crates, selective high utility hoods/beams, a repair patch and drainage add occupation and shadow pockets. Furniture relocations preserve the tested passage width, follow camera and entrances.
- **Canal/quays:** restrained parapet repair courses, mooring posts/collars, splash-darkened surfaces, an irregular waterline patina, bridge-landing stone and four retaining-wall loading pockets enrich the existing waterfront. No waterway, bridge, stair or quay layout redesign. Forty-nine small furniture/dressing placements use the shared art contract; solid additions have explicit simplified proxies.
- **Population:** district locals vary body width, coat hem, worker caps versus brims, apron/accent color, shawls and traveler satchels. Existing 42 identities, authored dialogue, schedules/shelter routes, movement and limb update tiers remain. This is modest presentation work, without a customization or crowd-avoidance system.
- **Night:** two of the four district lamps move to primary-street edges, with modestly increased warmth/intensity. Five total local PointLights and zero local shadow maps remain. Five feathered emissive pavement-bounce meshes add shop warmth cheaply; this is a deliberate authored illumination approximation, not additional dynamic lighting.

`src/simulation/district-art.ts` owns facade choices, stalls, lamps and furniture. `src/render/district-ground.ts` owns batched surface detail. NPC changes are optional appearance data and solid merged geometry; simulation state remains serializable and separate from render objects.

The original **27 lots / six archetypes**, x=48..146 m, z=-48..48 m addition, major circulation, two bridges, real stairs, raised Bell Guild, authoritative day/dusk/night/rain/wind and audio remain. `scope-audit.json` verifies 12 original layout/core/dependency/older-GLB files byte-for-byte against HEAD. NPC graph/schedule code is unchanged; actual all-edge and serialized-continuation tests pass. Source-image hashes remain unchanged and references stay under docs.

The actual local Blender 5.2.1 LTS export extends the original kit from 24 to **32 modules**, **131 primitives**, **99,192 source triangles**, **28 materials**, **4,925,292 GLB bytes**. The eight added modules are shutters, four goods displays, basket, bench and mooring post. Generator, editable source, source hashes, meter pivots/bounds, provenance and checksum report are retained. The four older shipped GLBs are unchanged; all five now total **7,381,776 bytes**. No downloaded content or reference pixels ship as textures.

## Checks actually run

| Command / check | Result | Scope / retained evidence |
| --- | --- | --- |
| `node tools/blender-district.mjs` | PASS | One actual isolated Blender export; GLB header/hash/module/material/triangle validation. `assets/source/district-kit.report.json`. |
| `npm run blender:fixture` | PASS | Local calibration export; existing GLTFLoader/browser fixture tests verify runtime meter axes/materials. |
| `npm test` | PASS | 9 Node + 59 simulation/assets/clock tests, 68 total. Actual Rapier full-width/camera checks, both directions of the circuit, all doors/NPC edges and serialization. `artifacts/m4-1/simulation-suite.json`. |
| `npm run typecheck` / `npm run check` | PASS | Strict TypeScript, repository contracts, shipped asset hashes and every tool's syntax. |
| `npm run build` | PASS | Vite main JS 5,451.64 kB minified / 1,993.58 kB gzip. Existing large-chunk advisory remains. |
| Headed `npm run test:browser` | PASS | 30/30 preserved M1–M4 cases; zero skipped/flaky/unexpected, no retries. Both complete district circuits, real controls/living systems, WebGPU, explicit WebGL2, fallback and failure handling. `artifacts/m4-1/browser-suite.json`. |
| Headed `npm run capture:m4` | PASS | Two diagnosed visual iterations, 1/1 each. Final 20 inspection captures were subsequently made by the passing full browser suite; `final/capture-states.json`. |
| `node tools/measure-district.mjs` | PASS | Three separate clean 60-second actual-W walks, clear/day, traced clear/day and rain/day. No errors/recovery/pause or lost locals. Measurement is not a stall-free claim. |
| `node tools/summarize-district-trace.mjs artifacts/m4-1/trace` | PASS | Offline bounded inspection of the actual Chrome trace; facts below. |
| `node tools/smoke-district-production.mjs` | PASS | Built preview, actual W moves 3.160 m, pointer lock, V first person, Esc/menu rain/night, 42 locals, development harness absent even at `?test=1`, zero browser errors. `final/production-smoke.json`. |
| `node tools/review-district-art.mjs` / `node artifacts/m4-1/verify-gallery.mjs` | PASS | Saved before/after gallery; actual headed Chrome loaded all 20 views and baseline images without page errors. `gallery-verification.json` and `review-gallery.png`. |
| `npm run references:verify` / `npm run doctor` | PASS | All four original references; Node 22.16.0, Git 2.39.2, Blender 5.2.1. Doctor alone does not prove gameplay/GPU. |
| `git diff --check` | PASS | Local whitespace audit. |

Initial tests diagnosed misplaced stock against an NPC exit, a bench against the market-link/tea-house approach and mooring/cargo touching walking margins. Placements moved; the existing assertions were retained. Initial checksum failure was the stale runtime manifest after the diagnosed new export; the real imported geometry/hash tests passed before updating its record. No speculative export/build retry loop or relaxed navigation assertion.

## Renderer, resource cost and performance tail

Actual headed Chrome **154.0.8037.92**, initialized **WebGPU**, adapter **AMD / RDNA2** (precise device/description blank). Live Windows inventory: **AMD Radeon RX 6950 XT**, driver **32.0.21045.5002**, status OK. Explicit WebGL2 rain/bridge crossing passed separately. No Edge or lower-end hardware result.

| Clean 60-second walk, 1920×1080 / DPR 1 | Clear/day | Traced clear/day | Rain/day |
| --- | --- | --- | --- |
| Samples / duration | 6,678 / 60.073 s | 7,000 / 60.054 s | 6,573 / 60.100 s |
| Mean / approximate FPS | 8.994 ms / 111.18 | 8.577 ms / 116.59 | 9.142 ms / 109.39 |
| Median / p95 / p99 | 7.0 / 14.1 / 27.6 ms | 7.0 / 14.0 / 20.9 ms | 7.0 / 14.1 / 21.0 ms |
| Maximum / frames >33.3 ms | 791.7 ms / 4 | 958.4 ms / 4 | 1,048.6 ms / 2 |
| End submitted draws / triangles | 744 / 11,042,675 | 752 / 11,046,311 | 732 / 11,037,883 |
| JS heap used / allocated bytes | 244,710,938 / 300,778,058 | 238,602,118 / 303,399,518 | 254,792,147 / 294,459,795 |
| Next waypoint | 8 | 8 | 8 |

The same authored measurement route reaches the south quay and approaches the market bridge in one minute; it does not finish the full circuit. Separate browser and Rapier tests cover the entire route. Each timed walk uses one setup bookmark then real W and yaw steering. A preliminary timed run overlapped the ending WebGL2 test; its report is retained in `performance-overlap/` and excluded above. The replacement and the trace/rain measurements run without concurrent test rendering.

At the final 1440×900 primary-street pose: **740 draws / 8,967,086 submitted triangles**, **497 geometries / 24 textures / 117 visible materials**, **499 visible-flag meshes / 31 top-level objects**, **194 instance batches / 43,156 primitive instances**, **42 active locals**, **5 loaded GLBs**. Against the retained M4 pose: draws rise from 696 (+44), submitted triangles from 8,881,014 (+86,072), batches from 174 (+20), instances from 42,213 (+943). Architecture accounts for 131 batches / 13,392 instances; batched ground detail contains 53,078 paving triangles. NPC geometry is 84,896 unique triangles across 210 meshes, versus 84,180 before. Wind still adapts 41 batches / 26,806 plant instances.

**The rare long-frame issue remains unresolved; the observed maxima increased.** M4's three maxima were 652.8 / 882.0 / 881.8 ms with 2 / 2 / 4 intervals >33.3 ms; M4.1 records 791.7 / 958.4 / 1,048.6 ms with 4 / 4 / 2. p95 changes modestly from 13.8 / 13.9 / 13.8 to 14.1 / 14.0 / 14.1 ms, still within the provisional ≤16.7 ms local target. Mean cadence is lower in these samples; p99 varies and rises in the clear/rain comparisons. These are sequential local observations, not controlled causal proof of an art/weather speed difference or stable regression rate.

The new actual 60-second CDP trace has **7,002 game callbacks**, maximum callback **17.491 ms**, maximum recorded main-thread GC **6.508 ms**, and callback timestamp gaps of **35.278 / 397.814 / 957.452 ms**. The largest recorded main-thread span is a **17.508 ms** animation-frame dispatch. No recorded single synchronous game/GC span explains the large gaps. Raw trace and bounded findings live in `artifacts/m4-1/trace/`. GPU execution and OS scheduler timing are absent, so the cause is not established; no speculative renderer, physics or schedule rewrite occurred.

rAF intervals include browser/automation/scheduling and trace overhead, not GPU time or uncapped throughput. Draw/triangle counts include shadow passes; visible flags do not prove frustum visibility; JS heap is not VRAM. Whole-module instance batches still have broad bounds, without per-building culling, distance LOD or streaming. No network first-playable transfer, resource soak or universal performance claim.

## Evidence and remaining human review

Play: **http://127.0.0.1:5173/**. Before/after review gallery: **http://127.0.0.1:5173/artifacts/m4-1/review.html**. Built preview: **http://127.0.0.1:4173/** while the local servers run. `node tools/review-district-art.mjs` rebuilds the gallery from actual saved evidence; unmatched camera poses are labeled.

Twenty final inspection views include the required whole-district eagle-eye, market square, first/third-person alley, canal/bridge, guild approach, night primary street and rain primary street, plus close goods/quay/service, doorway, rear/side, rural connection, dusk and night/rain market. Actual required views and extra detail captures were visually inspected. `final/capture-states.json` records full conditions; routes/backend/production endpoints remain alongside them. The original master was inspected as art direction. No reconstructed image, calibrated similarity score, traversal video or human acceptance claim.

Digital audio remains verified: five loops, market level 0.065, clear output RMS 0.007139 after gesture, lower night/rain market signal and zero output on pause. All 42 locals reach shelter in the living test. Physical listening and subjective sound quality remain for the owner; the audio source was not redesigned.

Remaining limitations:

1. Parallel rows, regular setbacks and broad quay shelves retain the M4 layout. Local loading/edge occupation improves the empty-field read, but the bounded footprint still differs from the master city's layered density and finite edges remain visible.
2. Shared timber joinery, six-pane glazing, striped canvas, simple sign emblems and coursed paving remain recognizable. Facade profiles reduce repetition; this is not bespoke character for every lot. Some guild/outer aprons remain broad.
3. NPCs are still simplified figures; the player remains a diagnostic capsule. There is no crowd avoidance or NPC dynamic collision, so locals can overlap. Doors remain closed without interiors. Existing conservative roof rain envelopes and angular close plants remain.
4. Long rAF gaps persist, with higher maxima in this sample. Lower-end devices, GPU time/VRAM and resource soaks remain unmeasured. Five pavement warmth surfaces are approximate bounce; physical sound listening awaits review.

**Next action: owner review of M4.1's playable River Market, before/after captures and performance tail. Stop here. M5/full-city work requires a later objective.** Evidence stays under ignored `artifacts/m4-1/`, outside shipped public assets; source references remain under docs.
