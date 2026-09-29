# M0 — local preflight

Read AGENTS.md and STATUS.md. This setup already exists: inspect it, do not rebuild it.

The parent verifies git status/branch and owns integration. Optionally delegate one read-only environment review and one art-reference review, at most two concurrent children; no child spawns more agents. Children report concrete findings, no overlapping edits.

1. Import the original ZIP through tools/import-references.ps1. Run strict verification. Commit original PNGs only after validating the manifest and reviewing git diff/status; never stage unrelated files. After the originals are committed, remove --allow-missing from the CI reference-verification step so missing future references fail CI.
2. Run doctor, tests and check. Record Node/npm/Git/Blender versions. Inspect browser/GPU capability using actual available browser tools; mark blocked if unavailable. Do not infer GPU performance from RAM or model names.
3. Run blender:fixture in the isolated background process; validate the GLB header and one-meter bounds when a viewer/runtime is available. Export alone does not prove runtime scale.
4. Confirm the two-agent setting is accepted by this Codex version, preserve user-selected model/provider and approval settings.
5. Review the city master and the LEFT rural target in the Godot comparison; record the reference hierarchy and missing-ground-view assumptions.

Acceptance: no missing/corrupt references, bootstrap tests/check pass, Blender export works or a specific blocker is documented, all local readiness claims have evidence. Update STATUS.md. Do not start game content or paid tooling. Stop for review.
