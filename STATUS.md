# Voxarrium status

## Current milestone

**M2.1 art-polish implementation and local evidence are ready for human art review. Artistic acceptance remains pending. Stop here; M3 and city expansion have not started.** Work performed on 2026-09-29, America/Los_Angeles; artifact timestamps use 2026-09-30 UTC. The owner's objective is retained in `docs/prompts/02-1-art-polish.md`.

The initial checkout was clean on `milestone/m2-reference-art-slice`, HEAD `8f051db`. The objective explicitly accepts the preceding M2 technical implementation. Changes remain local and uncommitted on that branch; no remote CI, push, deployment, paid service, image generation or Blender re-export was performed. The previous M2 status remains in Git history and its reviews remain in `docs/reference/REVIEWS.md`.

Two bounded native children owned disjoint files: vegetation/ecology (`src/render/rural-ecology.ts`) and paths/cliffs/stairs/banks (`src/render/rural.ts`). The parent owned shared contracts, materials, renderer integration, tests, reference comparison and documentation. No recursive delegation or dependency changes.

## What changed

- Six tree families: oak, hornbeam, orchard, alder, swept ash and irregular pine shelves, with two baked variants per family. Branching, crown topology, proportions, asymmetry and pigment differ. All 24 original tree positions and scales remain; the central trunk matches the original collider. Shrubs include spreading, wiry and upright forms.
- Authored woodland, meadow, dry-ground, ledge and bank communities combine bowed grass, fern, rosettes, clover, flowers, earth/duff/moss, roots, twigs and stones. Medium shrubs connect plant heights around trunks, cliff bases and terrace corners. Crop-approach patches replace more of the uninterrupted upper lawn. Paths and structure approaches stay clear; wheat/garden rows remain deliberate.
- Paths vary their width and boundary at low frequency, with broad wear/soil bands, local encroachment and embedded pebbles. Terrace faces retain useful large outcrops and add secondary fractures, soil contacts, discontinuous lips, crevice plants and lower scree. Macro terrain pigment responds to paths, trees, structures and terrace/bank edges.
- Both stairs display 132 uneven beveled stone slabs over the 44 original collision treads, with restrained seam growth and side shoulders. The reliable invisible step geometry remains authoritative.
- Riverbanks use sloping earth-to-shallow gradients, localized deposition, reed/plant/stone groups and bridge footings. Existing cheap animated water and moving highlights remain. The 14 m bridge span and comfortable crossing were preserved after visual review.
- Existing cottage/shed/bridge GLBs receive plaster washes, lengthwise wood grain, clay pigment, stone variation and ground-contact colors. Original position/index data, dimensions, files and collision proxies remain unchanged. The last lighting pass adds slightly warmer neutral fill and modest sunlight adjustment. No fog, bloom or depth of field conceals geometry.

Simulation, physics, controller, camera transforms, input behavior, renderer backend/fallback, capture bookmarks, terrace composition and hero placement remain unchanged. The in-app mouse-capture rejection fallback remains covered by the full browser suite. No current manual in-app verification is claimed for this art pass; the preceding compatibility report is in Git history at the starting commit.

## Review evidence and remaining differences

Open **http://127.0.0.1:5173/artifacts/m2-1/review.html** while the dev server runs. It presents the original LEFT rural target beside fresh M2 baseline and final M2.1 captures, with twelve selectable views. `artifacts/m2-1/comparison-conditions.json` confirms identical seed, player pose, camera, viewport and DPR for all twelve recorded comparisons.

Actual captures were inspected from eagle-eye, third person and first person, including cottage front/rear/east/west, garden, river/bridge, stairs and both crop-route endpoints. Timed water captures show moving highlights. The parent rejected sparse dagger crowns, spiky dark grass, striped banks, double-darkened stone and repeated moss pads during successive iterations; retained evidence records those corrections.

Compared with the fresh baseline, crown repetition is less conspicuous, populated terraces have more varied plant heights and contextual detail, paths have worn irregular margins, stairs read as individual stone slabs, banks support plant/stone groups, and cottage surfaces retain visible grain and restrained pigment variation at first-person distance. The target composition remains intact. This is a qualitative observation, not a similarity percentage or owner approval.

Three largest remaining visual differences:

1. Small grass and leaf units remain angular at close range; some shrubs still form compact rounded masses. Outer terrace clearings remain quieter than the target's painterly density.
2. Large cliff outcrops still dominate some player-scale views. Some backing gaps, thin straight soil lips and shallow-bank corners reveal the authored polygonal construction.
3. Pale path centers and the turquoise river retain broader, calmer negative space than the illustration. Bridge/river proportions remain an authored human-scale interpretation; the existing span was preserved for comfortable navigation.

`docs/reference/REVIEWS.md` records before/after observations, rejected passes and the review decision. The human gate has no recorded owner artistic acceptance. No expansion is authorized by this report.

## Checks actually run on the final source

| Command / check | Result | Scope / evidence |
| --- | --- | --- |
| `npm test` | PASS | 9 Node + 27 simulation/asset/clock tests; actual Rapier stepping and GLTFLoader imports. `artifacts/m2-1/simulation-suite.json`. |
| `npm run check` | PASS | Repository contracts, vendored GLB checksums, tool syntax and strict TypeScript. |
| `npm run build` | PASS | Vite production bundle. Main JS 5,280.46 kB minified / 1,938.83 kB gzip; existing chunk-size advisory remains. |
| `$env:VOXARRIUM_HEADED='1'; $env:VOXARRIUM_CAPTURE_DIR='artifacts/m2-1/final'; npm run test:browser` | PASS | Complete 18/18 installed-Chrome tests; zero skipped/flaky/unexpected. Preserved M1 input/camera/backend tests plus rural captures/routes. `artifacts/m2-1/browser-suite.json`. |
| `$env:VOXARRIUM_CAPTURE_DIR='artifacts/m2-1/final'; node tools/measure-rural.mjs` | PASS | Two bounded 60-second headed 1080p routes; actual W input/waypoint steering; zero errors, unexpected recovery or pause. Long-frame tails reported below. |
| `$env:VOXARRIUM_CAPTURE_DIR='artifacts/m2-1/final'; node tools/smoke-rural-production.mjs` | PASS | Built preview on 4173: actual W movement 3.125 m, mouse capture, V switch to first person, zero errors, development harness absent even with `?test=1`. |
| `npm run references:verify` | PASS | All four original PNG bytes/dimensions/SHA-256 hashes unchanged. |
| `npm run doctor` | PASS | Node 22.16.0, Git 2.39.2, Blender 5.2.1 LTS and reference diagnostics. Doctor does not validate GPU/gameplay. |
| `git diff --check` | PASS | Final local whitespace audit. No hosted checks claimed. |

One repeated browser run failed before input assertions: the mouse-capture rejection case exhausted its default five-second readiness wait while the page still showed "Starting renderer". The test now uses the existing 60-second rural renderer readiness budget. All movement/drag/pause assertions remain; no retries/skips were added. The complete suite was rerun and passed 18/18. Earlier failure report/trace: `artifacts/m2-1/browser-suite-startup-timeout.json` and `artifacts/m2-1/startup-timeout/`.

Rural route tests use one setup pose and then continuously cross the bridge, climb the main stairs, walk the cottage front/east/rear and ascend the crop terrace in both gameplay cameras. They do not teleport between obstacles. Simulation also verifies stair descent, the cottage closed-door threshold and all collision elevations. Explicit rural WebGL2 crossing and preserved M1 automatic fallback/startup-failure tests pass separately. Intentional injected failures are not errors in normal rural evidence. No traversal video or OS sleep/wake soak was recorded.

## Renderer and measured local performance

Headed Chrome **154.0.8037.57**, Windows, initialized **WebGPU**, actual adapter **AMD / RDNA2** (precise device/model fields blank). Separate live Windows inventory reports **AMD Radeon RX 6950 XT**, driver **32.0.21045.5002**, status OK. Explicit WebGL2 is separately captured and tested.

| Idle spawn measurement | Fresh M2 baseline | Final M2.1 |
| --- | --- | --- |
| Viewport / DPR | 1440 × 900 / 1 | 1440 × 900 / 1 |
| Warmed frame samples | 501 | 502 |
| Mean / approximate FPS | 6.934 ms / 144.21 | 6.935 ms / 144.20 |
| Median / p95 / maximum | 6.90 / 7.00 / 7.10 ms | 6.90 / 7.10 / 7.20 ms |
| Submitted draws / triangles | 231 / 7,086,105 | 204 / 7,429,807 |
| Geometries / textures / visible materials | 95 / 11 / 61 | 124 / 19 / 60 |
| Visible-flag meshes / top-level objects | 140 / 63 | 126 / 19 |
| Instanced batches / total instances | 20 / 17,781 | 48 / 29,179 |

Tree geometry uses fewer triangles than the original library, but added ecological detail means **total submitted scene triangles increase**. There is no overall triangle-reduction claim. `ecology-geometry.json` was an intermediate tree audit; use final live reports for final instance/resource counts.

| 1920 × 1080 / DPR 1 traversal | First final run | Bounded repeat, review activity paused |
| --- | --- | --- |
| Samples / duration | 8,646 / 60.043 s | 8,498 / 60.094 s |
| Mean / approximate FPS | 6.944 ms / 144.01 | 7.071 ms / 141.42 |
| Median / p95 / p99 | 6.90 / 7.10 / 13.90 ms | 6.90 / 7.10 / 14.00 ms |
| Maximum / frames >33.3 ms | 91.60 ms / 10 | 89.70 ms / 17 |
| Waypoints reached | 14 | 14 |
| JS heap used / allocated | 124,941,565 / 191,729,773 bytes | 137,729,265 / 183,865,453 bytes |
| Route-end draws / triangles | 193 / 6,765,521 | 189 / 6,760,941 |

Occasional long frames recur; their cause was not established. Both actual reports are retained: `final/performance-route-60s-run1.json` and `final/performance-route-60s.json`. The provisional local 1080p p95 ≤16.7 ms target passes, but this is not a claim of stall-free performance. An earlier M2.1 iteration run recorded no frames above 33.3 ms; it is retained in `iteration-03/` and does not override the final results.

Each minute-long walk reaches the crop terrace and returns to the cottage east side, without completing the whole return to the far bank. There is one intentional starting teleport and no recovery reset/pause. Complete outward traversal is separately covered by route tests.

All frame numbers are **requestAnimationFrame wall-clock intervals**, including local automation, not GPU execution time, VRAM or an uncapped throughput guarantee. Shadow passes are included in draw/triangle counts; visible-flag meshes are not frustum counts. No lower-end GPU, city-scale performance, stream-boundary resource soak or hosted CI is claimed.

## Play and inspect locally

```powershell
npm ci
node node_modules/vite/bin/vite.js --host 127.0.0.1
```

Open http://127.0.0.1:5173/ and select **Explore the garden**. WASD moves, mouse looks (left-button drag if capture is unavailable), Shift runs, Space jumps, V switches gameplay cameras, R resets and Esc pauses. Keys 1–4 select third person, first person, free/debug and eagle-eye. Eagle-eye remains an art/debug camera. Pause settings expose FOV and sensitivity. `/?backend=webgl`, `/?scene=m1` and `/?stage=blockout` retain their existing meanings.

For production: `npm run build`, then `node node_modules/vite/bin/vite.js preview --host 127.0.0.1` (port 4173). Direct Vite invocation was used because npm argument forwarding incorrectly supplied the host as a root path in this PowerShell session; the failed service invocation was diagnosed and replaced before evidence collection.

Evidence is ignored local content under `artifacts/m2-1/`: `before/`, `iteration-01/`, `iteration-02/`, `iteration-03/`, `final/`, `comparison-conditions.json`, reports and `review.html`. Final includes clean eagle-eye, both gameplay views, cottage sides/rear, garden, bridge, riverbank, stairs, both crop-route endpoints, timed water pair, explicit WebGL2, benchmark endpoint and production smoke. Exact poses/diagnostics: `final/capture-states.json`. Original reference PNGs remain under docs, outside shipped public assets.

**Next action: human art review of the comparison and playable slice. Stop at this gate.**
