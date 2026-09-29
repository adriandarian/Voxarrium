# Voxarrium status

## Current milestone
M0 — repository preparation / local preflight. Bootstrap branch: `bootstrap/voxarrium-foundation`.

## Present
Product/art/scale/architecture documents; bounded subagent workflow; local reference manifest and safe import; setup checks and tests; Blender scale-fixture script; PR/issue templates; bootstrap-only CI.

## Not implemented or verified yet
No city, Three.js runtime, player controller, NPCs, weather, audio, world streaming, or visual fidelity result. No browser/GPU measurements. Blender is installed on the owner's machine, not verified by this remote preparation. Runtime dependency install and lockfile update are M1 tasks.

## References
Four unchanged PNGs packaged separately as `Voxarrium-reference-images.zip`. Initial GitHub tree contains metadata and import tooling, not those binaries. M0 imports/verifies them locally, then commits them. Do not mark the visual-reference gate passed until strict verification succeeds.

## Active decisions
Third-person first; optional first-person; small rural art slice; Blender + GLB; vanilla Three.js/TypeScript runtime proposed; no Jev or paid service; default two concurrent child agents; no recursive fan-out.

## Next five actions
1. Bring the bootstrap branch into the local checkout without overwriting local work.
2. Import original references and run strict checksum verification.
3. Run doctor; verify Blender CLI, Node/npm, browser and GPU locally; record only relevant non-secret diagnostics.
4. Execute `docs/prompts/00-local-preflight.md`; calibrate 1-meter GLB export.
5. Execute M1 only after the M0 gate: lock dependencies, create renderer/capture harness and human-scale graybox.

## Performance / visual evidence
Not measured. Targets in PERFORMANCE_BUDGETS.md are provisional, not results. No claimed percentage match to the artwork.

## Bootstrap checks executed remotely
9/9 Node tests and repository checks passed. The reference ZIP and its four source hashes passed verification in the preparation container. Blender/PowerShell/browser execution on the owner's machine remains pending. See docs/BOOTSTRAP_VALIDATION.md for exact scope.
