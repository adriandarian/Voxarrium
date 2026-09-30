# Visual review log

The M2.1 objective explicitly accepts the M2 technical implementation. No owner runtime art acceptance has been recorded for this polish pass; the human M2.1 review remains pending.

## 2026-09-29 — M2.1 final art-polish review, human decision pending

Scope: existing 96 × 96 m rural slice, seed `104729`, branch `milestone/m2-reference-art-slice`, initially clean at `8f051db`. Implementation remains local and uncommitted. The exact owner objective is retained in `../prompts/02-1-art-polish.md`. No map expansion, new gameplay, image generation, weather, interiors or M3 work. Original master and LEFT rural target were directly inspected; all four reference hashes remain unchanged.

Conditions: headed Chrome 154.0.8037.57, initialized WebGPU on AMD/RDNA2; separate Windows inventory identifies RX 6950 XT, driver 32.0.21045.5002. Eagle-eye is 900 × 1200, gameplay/idle captures 1440 × 900, DPR 1. Static warm sun and readable fill, no time/weather system. All twelve before/final recorded camera transforms, player poses, seeds, viewports and DPR values match (`../../artifacts/m2-1/comparison-conditions.json`). Lighting differs only through the deliberate final polish pass. Unseen details, botanical families and human-scale dimensions are authored assumptions rather than measurements recovered from one illustration.

### Actual before/after evidence

Fresh baseline: `../../artifacts/m2-1/before/`. Final: `../../artifacts/m2-1/final/`. Each includes `eagle-eye.png`, `eagle-eye-clean.png`, `third-person.png`, `first-person.png`, `cottage-rear.png`, `cottage-east.png`, `cottage-west.png`, `bridge.png`, `riverbank.png`, `stairs.png`, `garden.png`, the two timed water images and exact `capture-states.json`. Final also includes both crop-route endpoints, explicit `webgl-fallback.png`, benchmark endpoint and `production-smoke.png`. These are real runtime screenshots, not reconstructed images or exports. No traversal video was recorded.

Local comparison viewer: `../../artifacts/m2-1/review.html`, served at http://127.0.0.1:5173/artifacts/m2-1/review.html. The LEFT target is displayed from the intact supplied comparison PNG using CSS clipping, beside selectable baseline/final views. No source pixels are used in shipped textures. Artifact paths are relative to this review document; ignored local evidence does not ship with the game.

| Priority | Baseline observation | Final observation |
| --- | --- | --- |
| Tree/shrub repetition | Scalloped round crowns and similarly rounded shrubs repeat immediately. | Six branch/crown families, two variants each, exposed branches, different heights/widths and asymmetric foliage islands break the repeated silhouette. Spreading, wiry and upright shrubs vary the middle layer. All 24 original tree origins/scales remain. |
| Ecological ground detail | Broad smooth lawn separates relatively thin grass/flower patches. | Woodland, meadow, dry-ground, ledge and bank communities layer bowed grass, fern/rosettes/clover, flowers, medium shrubs, earth/duff/moss, roots, stones and restrained debris. Added crop-approach groups connect upper terrace detail. Clearings still exist at outer edges. |
| Paths | Clean pale spline ribbons and repeated margins. | Unequal low-frequency boundaries/width, local grass encroachment, broad wear/soil bands and clustered embedded pebbles visibly soften the edges. Path centers remain broad and readable. |
| Cliffs/transitions | Large repeated outcrops with visible flat backing and regular top edges. | Retained rocks gain secondary fractures, slanted slate/chips, discontinuous soil lips, moss/soil contacts, crevice growth and lower scree. Large modules and some backing remain visible from player height. |
| Stairs | Smooth uniform modern-looking cuboid treads. | Individual uneven beveled stone slabs, side shoulders and sparse seam growth read as aged stone. Collision treads and dependable ascent/descent are unchanged. |
| River/banks | Broad calm turquoise strip, bare/smooth shore bands and abrupt bridge landings. | Low-contrast sloping shallow/earth gradients, localized deposition, clustered reeds/plants/stones and footings connect the bridge to the banks. Moving water marks remain subtle. The 14 m bridge and broad center remain for comfortable accepted traversal. |
| Cottage surfaces | Uniform plaster/timber/clay/stone is especially exposed in first person. | Soft plaster washes, timber/door grain aligned to piece length, tile pigment, stone mottling and restrained contact coloration survive close views on front/rear/both sides. GLB geometry and files are unchanged. |
| Macro ground/lighting | Broad green surfaces read uniformly beneath plants. | Meter-scale contextual pigment relates to paths, trees, structure and terrace/bank edges. Final modest sun/fill adjustment improves green/stone/roof readability without hiding geometry. |

### Inspection-driven iterations

1. `iteration-01/` exposed three dominant problems: overly sparse crowns with dagger-like fans; dark spiky grass and too little medium-height planting; striped/sawtooth banks and double-darkened cliff stones. Corrections filled asymmetric canopy islands, softened foliage, diversified shrubs, reduced ground-blade aggression and repaired bank geometry/color multiplication.
2. `iteration-02/` still showed angular hedgehog-like grass, gaps in medium shrub density, and cliff backing/lip repetition. Corrections used shorter bowed lighter grass, authored shrub pockets, lower earth/moss/clover detail, secondary rock fragments and crevice treatment. Repeated moss pads on stairs were reduced to sparse joint growth.
3. `iteration-03/` preserved the next full capture and minute-long route. Eagle-eye and both gameplay endpoints still showed overly quiet lawn beside the upper crop approach; path/water negative space and large cliff forms also remained. Six bounded authored communities were added around that approach. Main terrace/bridge dimensions were retained to protect the accepted navigation/composition; geometry was not expanded to imitate the illustration's unknown scale. Final captures show the new upper detail without obstructing either route.

All iteration directories are under `../../artifacts/m2-1/`. Parent reviewed eagle-eye against the rural target and checked third/first-person details after the major passes. The final pose comparison supports art observations; gameplay/performance are verified separately.

### Three largest remaining differences

1. **Plant language and outer density:** small grass/leaf units remain angular at close range, some shrub masses remain rounded, and outer clearings are quieter than the reference's richer painterly density.
2. **Player-scale terrain construction:** large cliff outcrops dominate some close views; backing gaps, thin straight soil lips and shallow-bank corners still expose polygonal construction.
3. **Negative-space proportions:** pale path centers and turquoise river retain broader, calmer space than the illustration. The bridge/river ratio is an authored human-scale interpretation; comfortable existing traversal was prioritized when considering its apparent oversizing.

### Technical verification and decision

Final source: `npm test` PASS (9 Node + 27 simulation/asset/clock); `npm run check` PASS; `npm run build` PASS (existing chunk advisory); `npm run references:verify` PASS; `npm run doctor` PASS; complete headed `npm run test:browser` PASS (18/18, zero skips/flakes). Full suite includes actual input, both continuous rural routes, explicit rural WebGL2 and preserved fallback/failure tests. Production smoke moved 3.125 m using real W input, captured the mouse, switched with V, exposed no development harness and recorded no errors. GLB files and original geometry/collision remain unchanged.

A preceding browser attempt hit the five-second readiness timeout before mouse-capture rejection assertions while still starting the renderer. Its trace/report were retained; the readiness wait now matches the existing 60-second rural warmup budget. Assertions/coverage were preserved and the entire suite reran successfully. `../../artifacts/m2-1/browser-suite.json` is the final passing report.

Final idle spawn: 502 warmed frames, mean 6.935 ms / 144.20 FPS, p95 7.10 ms, maximum 7.20 ms, 204 submitted draws / 7,429,807 triangles, 124 geometries / 19 textures, 48 instance batches / 29,179 instances. Fresh baseline: 231 draws / 7,086,105 triangles, 95 geometries / 11 textures, 20 batches / 17,781 instances. Tree triangles fell, but total submitted scene triangles increased with added ecological detail. Do not infer a whole-scene triangle reduction from the intermediate tree audit.

Two final headed 1920 × 1080/DPR 1 minute-long routes recorded 144.01 and 141.42 FPS, both p95 7.10 ms. **Long frames recur:** first maximum 91.60 ms with ten >33.3 ms; repeat maximum 89.70 ms with seventeen >33.3 ms. Their cause was not established; both reports remain in `final/performance-route-60s-run1.json` and `final/performance-route-60s.json`. Local p95 ≤16.7 ms passes; stall-free performance is not claimed. Both reached waypoint 14, crossing the river and reaching the crop terrace before returning to cottage east. They did not finish the entire return within a minute. Each used one setup teleport and no recovery reset/pause; complete outward routes pass in both gameplay modes.

These are rAF wall-clock intervals including local automation, not GPU execution time or uncapped throughput. Draw/triangle counts include shadows, visible-flag meshes are not frustum counts, and JS heap is not VRAM. STATUS includes exact counts/heap and limitations. No city-scale, lower-end-device or hosted CI result is implied.

**Decision: M2.1 implementation and local technical evidence are ready for human art review. Artistic acceptance is pending, with the three visible gaps and recurring timing tails recorded. Stop here; do not begin M3 or expand the city.**

## 2026-09-28 — M2 final local three-camera review, human decision pending

Scope: local uncommitted changes on `milestone/m2-reference-art-slice`, base `d6fd19e98ada48a50cbc0cc6f4f18347aa3ebb00`; scene `m2-rural-96m`, seed 104729. Chrome 154.0.8037.57, initialized WebGPU device AMD/RDNA2, Windows inventory RX 6950 XT. Eagle-eye 900×1200 and gameplay/close inspection 1440×900, DPR 1. Static warm directional sunlight and fill, no fog/weather/post-processing. Assumed rear/side elevations and human-scale dimensions remain explicit inventions from incomplete image direction.

Evidence actually opened and inspected: `artifacts/m2/final/eagle-eye-clean.png`, `eagle-eye.png`, `third-person.png`, `first-person.png`, `cottage-rear.png`, `cottage-east.png`, `cottage-west.png`, `bridge.png`, `riverbank.png`, `stairs.png`, `garden.png`, both route crop views, `water-time-0.png`, `water-time-6.png`, `webgl-fallback.png` and `production-smoke.png`. All paths are relative to the repository root. Exact poses/states are in `capture-states.json`. Local artifacts are ignored and do not ship with the game. The original LEFT rural target and master image were directly inspected; no numerical image score was used.

### Inspection-driven detail iterations

1. First detailed pass showed blocky crowns, repeated rounded stone courses and a visually blank water surface. The environment pass added layered foliage geometry, more variable cliff geometry, bank-color variation and moving current highlights. Cottage side/rear inspection also exposed seams where independently beveled plaster partitions met; the Blender generator now preserves flush plaster joins while retaining other modeled depth.
2. The next pass still produced balloon-like foliage cores with spiky leaves, full-height wedge-like cliff repetition and over-bright water marks. This rejected pass is retained in `artifacts/m2/review-02/`. The final pass replaces the spikes with smaller solid scalloped leaf bunches, reduces dark crown cores, combines broad bedrock with two or three offset strata/shelves, and shortens/dims the water glints. The final three-camera recapture confirms these changes; it does not eliminate every stylistic mismatch.
3. Continuous traversal exposed a cottage threshold first rise above the controller's permitted step height. Cottage and shed origins now meet the actual 4 m terrace. A focused Rapier check proves threshold ascent, closed-door collision and descent. Walking beside the east wall uses the open lane before the garden fence. Full route tests pass without obstacle-to-obstacle teleports.

### Three largest remaining differences

1. **Foliage repetition and silhouette.** Three overall tree forms and varied ecological placement are present, but the leaf-bunch and round-shrub units remain conspicuous. Compared with the LEFT target, crown voids, exposed branches, angular leaf groups and transitions between plant heights are insufficiently varied. Ground-level grass blades also repeat.
2. **Terrain/bank/path integration.** Main massing is connected and irregular, but stairs and pale paths remain too broad/clean, cliff joints still repeat, and the near-bank tongue lacks some of the target's sculpted elevation and ledges. Water moves visibly between the timed captures but has less surface complexity than the illustration. The finite open outer slice boundaries remain visible rather than being concealed.
3. **Material richness and detail hierarchy.** The roof, timber, plaster and stone have real depth and distinct colors, but their pristine surfaces and simplified contacts remain less rich than the source. Large open green areas reduce the target's density. Further improvement should refine silhouette, materials and edge transitions, not scatter more unrelated props.

### Qualitative assessment

| Criterion | Observed result |
| --- | --- |
| Composition | Cottage centered below upper-right wheat, shed to the left, garden to the right, lower stairs and wooden river crossing are coherent. The bridge/crop positions were corrected during blockout. Bank tongue and negative-space proportions still differ. |
| Terrain silhouette | Connected stepped elevations, curved paths, ledges and irregular shore remove the diagnostic graybox. The lower bank and cliff strata need a closer shape study. |
| Building silhouette | Thick terracotta roof, chimney, timber/plaster facade and dimensional openings work from front, rear and both sides. All-side geometry is present. The human-scale cottage is an interpretation rather than a traced miniature. |
| Scale and navigation | Same 1.75 m player and 1.62 m first-person eye; bridge, both stairs and cottage circuit pass actual physics in both modes. Close-range geometry has no observed facade trick or catastrophic hole. The diagnostic avatar remains. |
| Materials and palette | Warm roof/cream wall/dark timber, olive foliage and turquoise water establish the requested hierarchy. The surfaces remain more pristine and less locally varied than the artwork. |
| Vegetation and density | Multiple silhouettes and 24 trees, patch-based small vegetation, organized garden/wheat and protected paths. Repeated bunches and open broad surfaces remain obvious at gameplay distance. |
| Lighting/contact | Warm sun and soft fill produce readable roof/tree/bridge shadows without fog or bloom. The final close views show dimensional sills/eaves; more contact and surface variation could improve depth. |
| Paths and repetition | Traversal is clear; agriculture is deliberately ordered. Path edge breakup, natural stair integration and leaf/rock repetition remain the largest art weaknesses. |

Verification: 36 non-browser tests (9 Node + 27 simulation/assets/clock), strict check/typecheck, production build, original reference verification and 14 headed browser tests pass. Rural explicit WebGL2 bridge traversal passes; M1 backend/failure paths remain covered. Production smoke moved 3.09 m using actual W input and switched with V, with zero browser errors and no development harness. The 60.023-second 1920×1080/DPR 1 walk measured 8,643 rAF intervals: mean 6.944 ms / 144.01 FPS, p95 7.0 ms, maximum 8.0 ms. It reached the crop terrace and part of the return, not the entire round trip. Counts and caveats are in STATUS and the actual JSON reports; this is wall-clock cadence on one machine, not GPU execution time or a city performance guarantee. No video was recorded.

**Decision: technical/playability evidence passes; human artistic acceptance remains pending.** The scene improves on universal ground tiling, empty banks and shallow facade construction, but remaining differences are substantial enough that M2 is not declared reference-quality complete. Owner review may request focused M2 changes or explicitly accept the art direction. Stop here; M3/city expansion is not authorized by this review.

## 2026-09-28 — M2 structural review before detail

Scope: local `milestone/m2-reference-art-slice`, initially clean, M1 completion read from STATUS. Original hashes verified and all four PNGs inspected. Scene `m2-rural-96m`, seed 104729, Chrome 154.0.8037.57, initialized WebGPU, DPR 1. Eagle-eye comparison is a 900×1200 portrait to match the rural target's scope; gameplay evidence remains 1440×900. Static warm sun/environment fill; no weather, fog or post-processing added.

Actual evidence: `artifacts/m2/blockout/eagle-eye.png`, `third-person.png`, `first-person.png`, cottage rear/east/west, bridge, riverbank, garden and stairs views. `capture-states.json` records poses and complete states. `route-third-person.json` and `route-first-person.json` record a continuous river crossing, stair climb, cottage circuit, and upper crop ascent, with only one initial route setup teleport. These files are ignored local artifacts, not shipped assets.

First capture's three largest structural differences were the continuous narrow bank strip, long flat terrace silhouettes, and angular dirt ribbons. Corrections added a riverbank tongue, recessed side ledges and curved lane sampling. Matching the target's camera side exposed a fourth placement issue: bridge x=8 was too far right, so it moved to x=-2; wheat shifted from x=8 to x=15. Both riverbank landings were corrected to meet the relocated bridge. The reference view now uses the negative-X side, preserving the target's bridge slant and garden/field relationships. No geometry is restricted to that camera.

Verification after structural changes: six actual Rapier rural tests pass, covering both stair runs up/down, every inspection bookmark, bank-to-bank bridge and all cottage collision faces. Three headed rural browser checks pass, including the full route in both gameplay modes and deterministic captures. This is a parent structural review sufficient to begin art production, **not owner art approval**. The plain cliff faces, house placeholders and egg-shaped tree masses in these artifacts remain blockout work and are not a final style claim.

For each review record: date/commit, scene/seed, backend/browser/GPU, viewport/DPR, camera, time/weather, actual artifact paths, three largest mismatches, agreed changes, traversal defects, measurement caveats, and owner decision. Distinguish observed results from proposed fixes. Do not invent a score or approval.

## 2026-09-28 — M0 original-reference inspection

Scope: source references at base commit `dc10fe30779b637d9623de0811df8bd70ef0b66e`, inspected by the read-only reference-audit child after all four PNGs passed dimensions, byte count and SHA-256 checks. Evidence: `city-master.png` and the full `experiments/godot-attempt.png`. No generated scene, seed, runtime backend, gameplay camera, viewport/DPR, time/weather state, traversal recording or runtime screenshot exists for this review. The Unreal and Blender references passed integrity checks but were not visually reviewed in this M0 inspection.

Hierarchy confirmed: the master establishes elevated castle/tower landmarks, connected terraces and bridges, warm-roof neighborhoods, olive vegetation and turquoise waterways. The LEFT Godot-comparison image is the rural target: cottage, smaller teal-roof structure, fenced garden, raised crop terrace, winding path, stairs and wooden bridge. The RIGHT image and the Unreal/Blender images are earlier attempts, with attribution supplied by the owner.

Three observed differences between the RIGHT Godot attempt and LEFT target:

1. The attempt repeats a conspicuous square ground pattern over broad areas; the target varies grass, paths, vegetation and terrain transitions.
2. The attempt has sparse dressing along retaining walls and exposed ledges; the target groups shrubs, moss, flowers and bank vegetation around joints, terraces and structures.
3. The attempt simplifies cottage openings, eaves and timber/plaster details; the target shows deeper overhangs and more dimensional facade details.

Unresolved ground-view assumptions: exact dimensions, unseen rear/side facades, bridge clearance and underside, interior layouts, camera projection, lighting values and construction detail. Doorways, steps, lane widths and near-camera readability require coherent human-scale design and later runtime validation. These observations confirm the existing art direction; no new design decision, numerical fidelity score, runtime art approval or owner acceptance is implied.

Result: reference integrity and hierarchy PASS. Eagle-eye/third-person/first-person runtime review, traversal and human-scale validation BLOCKED until their later milestone implementations. Stop at M0 review.

## 2026-09-28 — M1 graybox scale and camera inspection

Scope: local `milestone/m1-human-scale-foundation` implementation before its milestone commit, scene `m1-human-scale-64m`, seed `104729`, Chrome 154.0.8037.57, initialized WebGPU (AMD/RDNA2; local GPU inventory RX 6950 XT), 1440×900, DPR 1. Static directional/fill light; no time/weather system. Fixed simulation bookmarks and camera poses are saved in `../../artifacts/m1/capture-states.json`.

Actually captured and inspected: `../../artifacts/m1/eagle-eye.png`, `third-person.png`, `first-person.png`, `blender-calibration.png`, `stairs-traversal.png`, `terrace.png`, `alley-traversal.png`, `bridge-traversal.png`, `camera-obstruction.png` and `webgl-fallback.png` (all in that same artifact directory).

Observed: eagle-eye exposes the full authored test course and bridge/banks; gameplay views show the doorway and stairs at human scale, the narrow alley enclosing the player/camera, and bridge rails at eye-relative height. The GLB cube and RGB axis markers import with validated dimensions, orientation and original materials. No source-reference comparison score or artistic match is claimed: plain boxes, uniform diagnostic materials and absence of environment detail are deliberate M1 scope limits.

Inspection-driven fixes: actual GLB import initially lost marker colors because display colors were not exported as Principled Base Color; corrected and regression-tested. Close-wall camera retraction initially let the avatar fill the screen; it now hides only that nearby avatar while retaining world geometry. Mouse settings and traversal were checked in the browser, separately from screenshot inspection. Both camera modes traverse the same measured colliders and retain one player state.

Result: M1 scale/geometry/camera evidence recorded; no M1 blocker found in this course. Multiple gameplay screenshots replace a traversal video. This remains a diagnostic capsule/controller, not character animation or final environment art. Owner approval is pending at the M1 review gate; no M2 work or city expansion authorized by this entry.
