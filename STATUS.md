# Voxarrium status

## Current milestone

**M3 implementation and local evidence are complete and ready for human review. Stop at this M3 gate; do not begin M4 or expand the city.** Work performed 2026-09-29, America/Los_Angeles; artifact timestamps use 2026-09-30 UTC. The owner's exact objective is retained in `docs/prompts/03-living-slice-objective.md`.

Preflight: clean working tree on `milestone/m3-living-slice`, HEAD `bbbecaf136e9ba529e86fba99bc434bdda97bb46`. GitHub confirms M2 PR #9 merged at 2026-09-30 03:04:07 UTC. The owner's M3 objective calls the rural slice approved and authorizes using it as the fixed world. This supersedes the old STATUS/review header's pending M2 art gate for M3 scope; no separate earlier owner review is invented. Historical review entries remain intact.

Changes remain local and uncommitted on the M3 branch. No push, new PR, merge, hosted CI, deployment, paid service, image generation, Blender re-export, dependency version change or global configuration change occurred. Two bounded native children owned disjoint environment and NPC modules/tests; the parent owned shared contracts, integration, audio/UI, verification and this status. No recursive delegation.

## Implemented behavior

- One serializable fixed-step environment state supports clear/cloudy/rain and day/dusk/night. Bounded four-second transitions drive directional sun/moon-like light, ambient fill/sky, wind, cloud coverage, rain and gradual wetting/drying. Time presets are authored representative states, not a full astronomical clock. Clear/day lighting matches M2.
- TSL height-anchored tree/plant/grass/wheat motion retains source geometry, maps and instance transforms. Existing water waves/highlights respond to wind/rain. A small distant cloud batch and roof-clipped rain add visible weather without fog, heavy volumetrics or post-processing. The existing garden lantern lights in low fill.
- Six stable locals (Mara, Tomas, Iona, Bram, Elin and Orrin) have local authored dialogue, different appearances, deterministic day/dusk walk/idle routes, night rest and rain shelter under existing cottage eaves. Every route/shelter segment clears actual rural Rapier collision at sampled human capsule size. Locals remain on the cottage terrace and are nonblocking, without dynamic colliders or crowd avoidance.
- F opens/closes nearby local dialogue or text about two existing landmarks. The addressed NPC stops and turns toward the player; walking away, pausing or entering a debug view clears the interaction. Both gameplay views share the same player and interaction state.
- Web Audio starts only from Explore/Resume's click. Locally synthesized wind/river/rain, spatial surface footsteps and quiet local/interaction tones require no files or service. Master, ambience, footsteps and local-cue controls work; pause/blur and master mute silence output. Three loops plus at most five transient voices are bounded and explicitly disposed. No recorded speech is included.
- Reduced motion uses one wind harmonic, 24 cloud lobes instead of 48, up to 216 rain drops instead of 720, 15 Hz water, 8 Hz near NPC poses and 4 Hz distant poses. Full nearby poses update at render cadence. No new geometry detail is hidden by this setting.

The accepted 96 × 96 m composition, cottage/shed/bridge GLBs, all 24 tree placements, terrain/path/stair/bank layouts, collision proxies, player/controller and camera transforms remain M2. The three canonical day comparison conditions match scene/seed/player feet/camera/FOV/aspect/viewport/DPR exactly. The original four reference hashes and shipped GLB checksums remain unchanged. M1 graybox and blockout views remain selectable.

## Checks actually run

| Command / check | Result | Scope / evidence |
| --- | --- | --- |
| `npm test` | PASS | 9 Node + 45 non-browser simulation/assets/clock tests; real Rapier and GLTFLoader, deterministic environment/NPC continuation, interaction, source ownership and reduced rain. `artifacts/m3/simulation-suite.json`. |
| `npm run check` | PASS | Repository contracts, vendored GLB checksums, tool syntax and strict TypeScript. |
| `npm run build` | PASS | Production Vite bundle, 5,414.49 kB minified / 1,979.26 kB gzip main JS. Existing large-chunk advisory remains. |
| `$env:VOXARRIUM_HEADED='1'; $env:VOXARRIUM_CAPTURE_DIR='artifacts/m3/final'; npm run test:browser` | PASS | Full 24/24 installed-Chrome tests, zero skips/flaky/unexpected. Existing input/camera/fallback/failure/rural routes plus new weather, interaction, audio and WebGL2. `artifacts/m3/browser-suite.json`. |
| `npx playwright test --project=living-browser --grep 'recovery preserves' --reporter=list` with headed/final env | PASS | Subsequent test-only lifecycle addition, 1/1. Real R preserves world identities/weather; idempotent disposal releases audio sources, renderer ownership and harness. `final/lifecycle-verification.json`. Current full suite has 25 tests; the 24 + 1 were separate runs. |
| `$env:VOXARRIUM_CAPTURE_DIR='artifacts/m3/final'; node tools/measure-rural.mjs` | PASS | Bounded 60-second headed 1080p clear/day actual-W traversal, zero errors/recovery/pause. |
| `$env:VOXARRIUM_CAPTURE_DIR='artifacts/m3/rain'; $env:VOXARRIUM_WEATHER='rain'; node tools/measure-rural.mjs` | PASS | Separate bounded 60-second rain/day traversal, zero errors/recovery/pause. |
| `$env:VOXARRIUM_CAPTURE_DIR='artifacts/m3/final'; node tools/smoke-rural-production.mjs` | PASS | Built preview on 4173; actual W moves 3.125 m, mouse capture, V first person, F Orrin dialogue, rain/dusk menu controls, no development harness even with `?test=1`, zero errors. |
| `npm run references:verify` | PASS | Original bytes/dimensions/SHA-256 for all four PNGs. |
| `npm run doctor` | PASS | Node 22.16.0, Git 2.39.2, Blender 5.2.1 LTS and references. Doctor does not prove GPU/gameplay. |
| Canonical pose comparison / `git diff --check` | PASS | Exact recorded conditions match 3/3; local whitespace audit. |

The first simulation run failed an NPC interaction fixture placed at the last millimeters of a segment: the correct next tick reached its node and idled. The test now selects a genuinely mid-segment local. A separate continuity test spent excessive time on 144,000 individual assertions; that old worker was stopped after diagnosis, and equivalent maximum-step/elevation assertions aggregate the same 12,000 frames. Final combined tests pass all 54. No retries/skips or weakened path/collision assertions were introduced.

Before integration, fresh M2 `npm run capture` and its 60-second route also passed under `artifacts/m3/baseline/`. A localhost dev server was already running; an attempted second server reported port 5173 in use, so the existing verified Voxarrium server was reused. No repeated startup/export loop was used.

## Actual renderer and performance

Headed Chrome **154.0.8037.57**, Windows, initialized **WebGPU**, actual adapter **AMD / RDNA2** (precise device fields blank). Separate live Windows inventory: **AMD Radeon RX 6950 XT**, driver **32.0.21045.5002**, status OK. Explicit WebGL2 wind/rain/NPC rendering and river crossing pass separately; preserved M1 capability-masked automatic fallback and visible startup failure also pass. Edge/lower-end devices were not tested.

| Matched idle third-person spawn | Fresh M2 | Final M3 clear/day |
| --- | --- | --- |
| Viewport / DPR | 1440 × 900 / 1 | 1440 × 900 / 1 |
| Samples | 501 | 503 |
| Mean / approximate FPS | 5.272 ms / 189.67 | 7.028 ms / 142.29 |
| Median / p95 / maximum | 5.80 / 7.60 / 9.30 ms | 6.90 / 7.10 / 20.50 ms |
| Submitted draws / triangles | 204 / 7,429,807 | 255 / 7,454,199 |
| Geometries / textures / visible materials | 124 / 19 / 60 | 156 / 19 / 65 |
| Visible-flag meshes / top-level objects | 126 / 19 | 157 / 21 |
| Instance batches / instances | 48 / 29,179 | 49 / 29,227 |

M3 adds 30 NPC meshes with 12,084 unique triangles, a cloud batch and rain buffer. Wind adapts 27 batches / 26,269 existing instances. There is no overall draw/triangle-reduction claim.

| 1920 × 1080 / DPR 1 actual-input route | Fresh M2 | M3 clear/day | M3 rain/day |
| --- | --- | --- | --- |
| Samples / duration | 10,678 / 60.129 s | 9,050 / 60.019 s | 10,692 / 60.054 s |
| Mean / approximate FPS | 5.630 ms / 177.61 | 6.631 ms / 150.81 | 5.616 ms / 178.07 |
| Median / p95 / p99 | 6.60 / 8.10 / 12.00 ms | 6.90 / 7.10 / 8.30 ms | 6.70 / 8.10 / 10.80 ms |
| Maximum / frames >33.3 ms | 111.20 ms / 9 | 80.00 ms / 3 | 79.80 ms / 8 |
| Waypoints reached | 14 | 14 | 14 |
| JS heap used / allocated bytes | 132,902,373 / 194,089,785 | 119,402,791 / 189,507,655 | 122,521,724 / 183,763,316 |
| Route-end draws / triangles | 208 / 6,770,225 | 233 / 6,784,565 | 240 / 6,784,501 |

Clear route mean is 1.001 ms higher than the fresh M2 run; the rain run has a different cadence and a lower mean. **rAF scheduling varied across runs, so these are measured observations, not an isolated causal weather/NPC cost or speedup.** Both M3 p95 results pass the provisional ≤16.7 ms local target. Occasional long frames persist; their cause was not established. No stall-free guarantee.

Each route starts with one intentional setup teleport, continuously crosses the bridge, climbs stairs, circles the cottage, reaches the crop terrace and returns as far as cottage east (waypoint 14). It does not finish the whole return within one minute. Full outward traversal in both gameplay cameras is separately tested. Frame numbers are requestAnimationFrame wall-clock intervals including local automation, not GPU execution time/uncapped throughput. Draw/triangle counts include shadows; visible meshes are visibility flags, not frustum counts; JS heap is not VRAM. No city-scale, streaming/resource soak, OS sleep/wake or hosted CI claim.

## Visual and audio evidence

Review viewer: **http://127.0.0.1:5173/artifacts/m3/review.html** while the dev server runs. It shows fresh M2 beside M3 day/cloudy/dusk/night/rain/interaction/motion views. `artifacts/m3/comparison-conditions.json` proves the three canonical day pose matches; other pairs label context-only differences.

Actually inspected: original city master/LEFT rural target, fresh M2 eagle-eye, M3 eagle-eye day/dusk/rain, third-person day/dusk/night/rain, first-person day/night/rain, WebGL2 rain, NPC front-facing interaction, and identical-camera motion pair. Both continuous routes pass. The first night doorway capture was too dark; final fill and the existing lantern improve readability. Captures show the cottage/bridge/terrain/vegetation language intact. The player remains the diagnostic capsule. `docs/reference/REVIEWS.md` records three remaining visual/behavior limitations and the review decision.

`final/audio-verification.json`: audio status is awaiting gesture before click, running afterward, output RMS 0.00515 initially / 0.03820 in rain; pause/master mute RMS 0. Four wood footsteps and bounded voice/listener facts are recorded. `final/rain-river-audio.webm` is a three-second, 48,596-byte **internal live browser audio-graph recording**. It uses no microphone and is not physical speaker/headphone listening evidence. Subjective sound quality remains for owner review.

## Limits and review gate

No known technical blocker remains in the tested local slice. Human acceptance of M3 feel, simplified characters, weather and subjective audio is pending. Locals can pass through each other; they have no crowd avoidance/dynamic collision. Weather uses simple local streaks and conservative roof envelopes, not precise sloped-roof precipitation. Footstep categories use authored region approximations. No recorded voices, interiors/openable doors, quests/economy/combat, multiplayer, city expansion or persistent save/settings UI was added. State serialization and deterministic mid-transition/mid-route continuation are tested; reload intentionally returns to clear/day defaults.

Play at **http://127.0.0.1:5173/**. Explore activates sound; WASD/mouse, Shift, Space, V, F, R and Esc work. Open **Weather, light & sound** in the paused menu for presets, reduced motion and volumes. Keys 1–4 retain gameplay/debug camera selection; eagle-eye remains review/debug. Production preview is **http://127.0.0.1:4173/** while its local server runs.

All evidence is ignored local content under `artifacts/m3/`, outside shipped public assets. References remain under docs. Exact poses, reports, screenshots and audio are factual artifacts, not reconstructed/generated media or numerical visual quality scores.

**Next action: owner review of M3's playable slice, captures and sound. Stop here; M4 is not authorized by this completion report.**
