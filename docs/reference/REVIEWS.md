# Visual review log

No owner runtime art approval has been recorded. M2 is implemented for review; reference-quality acceptance remains pending.

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
