# Decision log

## 2026-09-28 — Bootstrap
- Third-person is the primary game camera; first-person shares the world; eagle-eye is art/debug.
- Blender + GLB and vanilla Three.js are the intended pipeline. Validate the renderer/backend locally before committing to advanced effects.
- One rural slice is the first art gate. Scale and composition precede clutter; visual approval precedes district expansion.
- Two concurrent subagents maximum by default, no recursive delegation, explicit ownership and parent integration. No paid provider or Jev configuration.
- Keep bootstrap dependencies empty; choose/pin actual runtime package versions in M1 with registry access and a real lockfile. No claimed r186 requirement.
- Preserve the four source PNGs unchanged in a checksum-verified local overlay. The initial connector-based commit could not include the multi-megabyte original binaries through a mounted-file upload route, so local import/commit was planned for M0 (superseded by the merged-originals update below).
- Keep source/reference licenses unassigned until the owner decides; do not silently add MIT or other licensing.

## 2026-09-28 — M0 committed-reference update
- The bootstrap and original PNGs are merged into main. Strict local verification passes for all four against the existing manifest, so normal setup verifies the committed files first; ZIP import remains only a recovery option for missing originals.
- CI now requires all four originals, without `--allow-missing`. Preserve source hashes and exact PNG bytes; a future failure requires diagnosis and restoration of the correct original, not a manifest change to accept a mismatch.

Append new decisions with alternatives, evidence and rollback conditions. Do not rewrite history to imply a proposal was validated.

## 2026-09-28 — M1 playable foundation

- User authorized M1 on `milestone/m1-human-scale-foundation` from clean commit `3703b7d`. M0's remaining runtime/GPU/fixture inspection items are now resolved by the M1 browser evidence; effective global Codex settings were not investigated or changed.
- Registry queries selected exact Three.js `0.186.1`, typings `0.186.0`, Rapier compat `0.21.0`, TypeScript `7.0.2`, Vite `8.3.1`, Playwright `1.63.0`, Node typings `26.6.3`. Official docs and installed source/types were checked. Node `22.16.0` meets the installed Vite/Playwright requirements. Real npm lockfile is committed with the foundation.
- WebGPURenderer is appropriate for the simple standard materials/shadows here. Actual initialized WebGPU device reports AMD/RDNA2; explicit WebGL2 and injected WebGPU-unavailable fallback both launch the same course. Fallback reason stays visible/reportable. No TSL/custom shader/postprocessing pipeline is needed for M1. Revisit if future effects fail fallback compatibility; do not relabel fallback as WebGPU.
- One position-based Rapier capsule drives both gameplay modes. Fixed 60 Hz step; cap six catch-up steps, clear time/input on pause/blur; interpolate render position. Stair colliders are real 0.17 m risers, 0.30 m treads; autostep 0.21 m, climb/slide threshold 45°. Distinguish steep-only contact from walkable support so gravity accumulates on a steep face.
- Follow camera uses sphere casts, immediate inward correction and eased outward recovery. Hide only the diagnostic avatar when the camera retracts into its space; world collision/visibility remains intact. FOV and sensitivity are simple menu settings, no head bob.
- Course is authored stable data rather than procedural city generation. Seed 104729 identifies this specific fixture; arbitrary seeds do not invent another layout. All authored dimensions remain design assumptions, not reconstructed measurements from the source art.
- Calibration export gains asymmetric RGB markers and explicit Principled Base Color. Runtime validation caught the original display-color-only export turning gray, now rejected by a regression test. Keep the reviewed GLB vendored so Blender is not required for normal startup.
- No aggressive optimization in M1. The production JS bundle is about 5.21 MB minified/1.91 MB gzip, largely Three.js and embedded Rapier WASM; Vite emits its chunk-size advisory. Split/loading optimization awaits a measured later need. Current baseline is a tiny local scene, not city-scale proof.

## 2026-09-28 — M2 rural art slice

- The explicit M2 objective authorizes work through the next human review gate, superseding the M1 hold. Initial branch `milestone/m2-reference-art-slice`, clean HEAD `d6fd19e98ada48a50cbc0cc6f4f18347aa3ebb00`. Parent owns composition/contracts/integration/reviews; two bounded children own Blender hero assets and environment geometry respectively, without recursive delegation.
- Preserve the M1 foundation and its selectable test world. Add optional shared triangle surfaces and per-course recovery bounds rather than replacing locomotion or introducing a terrain engine. The first structural review and continuous-route checks support this small authored-scene approach; revisit only for a demonstrated topology/streaming need in a later milestone.
- Structural comparison moved the bridge closer to the stairs and shifted the wheat field to the upper right. Negative-X portrait eagle-eye framing matches the rural target's orientation while all assets remain freely inspectable. Exact dimensions, rear facades and small details remain authored assumptions.
- Use project-authored Blender geometry for architecture and deterministic runtime geometry/instances for plants and terrain dressing. Generated pigment maps use no source-image pixels. Standard lit materials and simple water movement preserve the existing backend architecture; no new postprocessing compatibility layer is introduced.
- Art acceptance and technical validation remain separate. Stop for human art review before M3 or any city expansion. Bundle-size work remains tracked rather than expanding this art experiment.
