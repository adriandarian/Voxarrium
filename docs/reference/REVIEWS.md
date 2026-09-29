# Visual review log

No runtime art review has passed yet.

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
