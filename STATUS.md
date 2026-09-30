# Voxarrium status

## Current milestone

**M4 implementation and local evidence are ready for human review. Stop at this M4 gate; do not begin M5 or full-city generation.** Work performed 2026-09-30, America/Los_Angeles. The owner's exact objective is retained in `docs/prompts/04-first-district-objective.md`.

Preflight was clean on `milestone/m4-first-district`, HEAD `c639a93f5c33e1cb994afb3b3f5ec1a99eb75401`. GitHub confirmed M3 PR #10 merged at 2026-09-30 04:10:35 UTC. The owner's new objective establishes the accepted M2/M3 quality bar and explicitly authorizes this bounded district. It supersedes the historical M3 pending header for M4 scope; no separate earlier owner art review is invented. Historical entries remain in `docs/reference/REVIEWS.md`.

Changes remain local and uncommitted. Two native children owned disjoint navigation/tests and Blender architecture/export modules; the parent owned layout contracts, composition, population, integration, audio, performance, captures and this status. No recursive delegation. No push/PR/merge, hosted CI, remote deployment, image generation, paid service, dependency version change, model-provider change or global configuration change occurred. The actual local Blender export is new.

## Implemented district

- A bounded authored addition occupies x=48..146 m, z=-48..48 m beside the existing rural edge. Twenty-seven full 3D buildings use six archetypes: residential, merchant, workshop, townhouse, canal and civic. Different widths/depths, one to three floors, gable/hip/mansard roofs, palette emphasis, yaw, balconies, shop windows, signs and awnings are deliberately composed. A raised Bell Guild with belfry is the landmark. Unseen elevations, trades, civic details and dimensions are explicit authored assumptions.
- Five connected primary/secondary/passage/alley paths join the market and two quays. The bent primary street starts at the rural edge. Two timber bridges cross the continued river; two 24-riser stairways descend four meters, and eight 15 cm civic risers climb to the guild apron. Actual Rapier supports player/camera clearance, full two-way circuits, every street-to-door approach, threshold ascent and bridge/parapet containment. No hidden stair ramps. Closed doors have stable future interior hooks; no interiors or opening system is claimed.
- Four stalls have merchant positions, goods, solid counters and meeting routes, leaving the center clear. Nine intentional courtyard/working-yard planting patches and window boxes extend rural vegetation, without uniformly scattered clutter. The original rural geometry, six inhabitants, hero GLBs and collision remain selectable at `?scene=m2`; M1 remains at `?scene=m1`. M4 is the default, and eagle-eye remains a debug/review camera.
- Thirty-six new authored district locals plus six rural locals give 42 stable serializable identities. Merchants, workers, residents, travelers and civic keepers use local dialogue, different speeds, waits and routes. Every authored graph edge clears sampled actual Rapier capsule/support queries. Day/dusk activity and rain/night eave shelter share the existing environment. All 42 simulate at 60 Hz; distant limb poses update at 4 Hz, reduced nearby at 8 Hz. There is no unloaded NPC tier or crowd avoidance.
- One authoritative M3 environment drives day/dusk/night, clear/cloudy/rain, wetness, wind, clouds, water and NPC shelter throughout both areas. District plants use the existing TSL wind adapter. Conservative per-building roof envelopes clip rain; the aggregate architecture bounds do not suppress rain across streets. Four district PointLights plus the existing garden light total five local lights, with zero local shadow maps. Windows/lantern surfaces glow without a light per window. No fog or post-processing hides the boundaries.
- The existing gesture-started Web Audio graph adds two localized procedural market murmurs, nearby daytime workshop impacts, closed-door cues, stone/wood steps and extended canal attenuation. Night reduces market levels; rain reduces activity. Categories, pause, mute and disposal remain shared. Five loops plus at most five transient voices are bounded. No recorded speech or remote dialogue service.

The Blender kit contains 24 modules, 111 exported primitive meshes, 94,244 source triangles and 28 materials; GLB payload 4,674,396 bytes. Source, generator and export facts are retained under `assets/source/` and `tools/blender/`. Runtime composition uses 111 architecture instance batches and 12,449 primitive instances, plus 537 garden/planter instances. Dimensional openings, full sides/backs, stone plinths, roof thickness/eaves/ends and the civic belfry are real geometry. Two world-coordinate TSL plaster materials avoid UV seams between partitioned wall panels. Source-image hashes are preserved; no reference pixels ship in runtime textures.

## Checks actually run

| Command / check | Result | Tested scope / evidence |
| --- | --- | --- |
| `node tools/blender-district.mjs` | PASS | Actual Blender 5.2.1 LTS local export, GLB header/hash/module/material/triangle checks. `assets/source/district-kit.report.json`. |
| `npm test` | PASS | 9 Node + 59 non-browser simulation/assets/clock tests, 68 total. Real Rapier/GLTFLoader, full district circuits, doors/camera, all NPC edges and serialized continuation. `artifacts/m4/simulation-suite.json` holds the 59-test report. |
| `npm run typecheck` / `npm run check` | PASS | Strict TypeScript, repository contracts, shipped GLB checksums and tool syntax. |
| `npm run build` | PASS | Vite production bundle: 5,442.86 kB minified / 1,989.97 kB gzip main JS. Existing large-chunk advisory remains. |
| Headed `npm run test:browser` | PASS | Complete 30/30 M1–M4 tests; zero skipped/flaky/unexpected, no retries. Real controls, both complete district gameplay circuits, shared living systems, fallback and startup-failure coverage. `artifacts/m4/browser-suite.json`. |
| Headed `npm run capture:m4` | PASS | Subsequent capture-only rerun after improving civic/rear/side inspection poses, 1/1. Runtime source unchanged. `artifacts/m4/capture-suite.json`. |
| `node tools/measure-district.mjs` | PASS | Three separate bounded 60-second headed actual-W walks: clear/day, clear/day with CDP trace, rain/day. Zero browser errors/recovery/pause, population 42. See measurements below. |
| `node tools/smoke-district-production.mjs` | PASS | Built preview on 4173; actual W moves 3.160 m, pointer lock, V first person, Esc/menu rain/night, 42 locals, no development harness even with `?test=1`, zero errors. `final/production-smoke.json`. |
| `npm run references:verify` | PASS | Unchanged original bytes/dimensions/SHA-256 for all four PNGs. |
| `npm run doctor` | PASS | Node 22.16.0, Git 2.39.2 and Blender 5.2.1 LTS. Doctor does not prove gameplay/GPU. |
| `git diff --check` | PASS | Local whitespace audit. |

Navigation iterations were diagnosed before correction: a shop overlapped the approach, a link ended on the higher landing, and north-quay sampling touched the descending stair. Shared layout/clearance now avoids those conflicts. NPC routes now move outward before turning along rotated facades. Initial aerial inspection exposed overly broad brown ground; stone perimeters, selected setbacks/yaws and authored courtyard/window planting improve street relationships. All final collision assertions remain. No export/build retry loop, skipped assertions or fabricated visual score.

## Actual renderer and scaling measurement

Headed Chrome **154.0.8037.92**, Windows, initialized **WebGPU**, actual adapter **AMD / RDNA2** (precise device/description fields blank). Live Windows inventory: **AMD Radeon RX 6950 XT**, driver **32.0.21045.5002**, status OK. Explicit M4 WebGL2 rain rendering and bridge crossing pass separately. Preserved capability-masked fallback and visible startup failure also pass. Edge and lower-end hardware were not tested.

| 60-second actual-input route, 1920×1080 / DPR 1 | Clear/day | Clear/day, traced repeat | Rain/day |
| --- | --- | --- | --- |
| Samples / duration | 7,892 / 60.074 s | 7,672 / 60.096 s | 7,946 / 60.084 s |
| Mean / approximate FPS | 7.611 ms / 131.40 | 7.831 ms / 127.69 | 7.561 ms / 132.27 |
| Median / p95 / p99 | 7.0 / 13.8 / 20.7 ms | 7.0 / 13.9 / 20.8 ms | 7.0 / 13.8 / 14.0 ms |
| Maximum / frames >33.3 ms | 652.8 ms / 2 | 882.0 ms / 2 | 881.8 ms / 4 |
| End submitted draws / triangles | 718 / 10,955,335 | 715 / 10,952,295 | 716 / 10,952,251 |
| JS heap used / allocated bytes | 254,959,582 / 299,854,222 | 248,227,986 / 298,813,858 | 238,283,730 / 283,599,030 |
| Next route waypoint | 8 | 8 | 8 |

Each walk uses one setup bookmark, then real W with yaw steering. It goes from plaza to upper lane, civic approach, east stairs/bridge, south quay and toward the market bridge, ending near x=97,z=29. It does not finish the full circuit in one minute. The complete district circuit and rural return are separately tested continuously in both gameplay modes; actual simulation also tests the reverse circuit. Fixed-step browser circuit input is distinguished from the timed real-keyboard route.

At the captured primary-street pose (1440×900 / DPR 1): **696 draws / 8,881,014 submitted triangles**, **471 geometries / 24 textures / 111 visible materials**, **473 visible-flag meshes / 31 top-level objects**, **174 instance batches / 42,213 primitive instances**, **42 active NPCs**, **5 loaded GLBs**. Wind adapts 41 batches / 26,806 existing plant instances. NPC presentation adds 210 meshes with 84,180 unique character triangles. Whole-module batching has broad bounds; no per-building culling or distance LOD is implemented. Instancing is reuse, not a claim that all submitted geometry is frustum visible.

The five shipped GLBs total **7,130,880 bytes**. Build gzip JS plus GLB bytes is not measured first-playable network transfer; generated textures, HTTP caching/compression and decoder startup were not profiled. No universal draw/triangle ceiling or city-scale memory claim.

**Long frames recur and were investigated.** `artifacts/m4/trace/browser-performance-trace.json` contains the actual 60-second CDP trace; `trace-findings.json` identifies two rAF gaps (~359/878 ms in callback timestamps, 354.1/882.0 ms in rAF intervals). Largest recorded game callback: **16.146 ms**; largest main-thread GC: **5.591 ms**. Async frame records show 359/877 ms with zero blocking duration. Background marking overlaps part of the gaps; no recorded single synchronous JS/GC event explains them. The trace lacks GPU execution and OS scheduler timing, so the root cause remains unresolved. No speculative optimization or stall-free claim.

All three local p95 observations meet the provisional ≤16.7 ms target, while the tail remains a material risk. Trace adds overhead; rAF cadence varies, and these runs do not isolate a causal weather/NPC cost or speedup against M3. Intervals include local automation and scheduling, not GPU execution/uncapped throughput. Draws/triangles include shadows; visible meshes are flags, not frustum counts; JS heap is not VRAM.

## Review evidence and gate

Play: **http://127.0.0.1:5173/**. Review gallery: **http://127.0.0.1:5173/artifacts/m4/review.html**. Built preview: **http://127.0.0.1:4173/** while its local server runs. Explore activates controls/audio. WASD/mouse, Shift, Space, V, F, R and Esc work; paused Weather, light & sound selects presets/reduced motion/category levels. Keys 1–4 retain gameplay/debug view selection.

Actually captured and visually inspected: eagle-eye, third-person primary street/plaza/bridge/guild approach, first-person alley/doorway/south quay/rear passage/side corner/rural entrance, dusk/night/rain, explicit WebGL2 and production smoke. Original master and LEFT rural target were also inspected. Sixteen authored inspection images plus route/backend/production endpoints live under `artifacts/m4/final/`, with complete recorded state/camera/backend/count conditions in `capture-states.json`. These are real runtime screenshots, not reconstructed images. No traversal video.

Digital audio evidence: five loops, positive clear-market level 0.065 and output RMS 0.00952 after gesture, night/rain market level 0.001144, and zero output on pause asserted by the browser test. `living-verification.json` records clear/rain/recovery snapshots, all 42 sheltered after advancing, and bounded audio/listener facts. Physical speakers/headphones and subjective sound quality have not been listened to. Sound is filtered procedural texture, without recorded speech.

Remaining review risks:

1. The window/shutter vocabulary and some setbacks still repeat. Broad paving/quays and finite rectangular outer edges are calmer/more regular than the master; richer fine-grain street dressing remains an art-review question. This is a bounded district, not a claim of full-city illustration equivalence.
2. Locals are simplified stylized figures; the player is still a diagnostic capsule. Locals have no crowd avoidance/dynamic collision and can pass through one another. Doors stay closed, without interiors. Rain uses conservative roof boxes and simple streaks; plants retain angular close-range units.
3. Reproducible long rAF gaps remain unexplained despite trace inspection. No distance LOD, streaming/resource soak, GPU-time/VRAM measurement, lower-end-device result or hosted CI is claimed. Subjective audio also awaits owner review.

**Next action: owner review of M4's playable district, three-camera captures, performance tail and sound. Stop here. M5/full-city generation requires a later objective.** Evidence remains ignored under `artifacts/m4/`, outside shipped public assets; source references stay under docs.
