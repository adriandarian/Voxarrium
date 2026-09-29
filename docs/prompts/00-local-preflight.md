# M0 — local preflight

Read AGENTS.md and STATUS.md. This setup already exists: inspect it, do not rebuild it.

The parent verifies git status/branch and owns integration. Optionally delegate one read-only environment review and one art-reference review, at most two concurrent children; no child spawns more agents. Children report concrete findings, no overlapping edits.

1. The bootstrap and four reference PNGs are merged into main. Inspect git status and the current branch, preserve unrelated work, and use the current setup branch; do not switch to the old bootstrap branch. Run `npm ci` and `npm run references:verify` against the committed PNGs before considering import. Do not replace, regenerate, resize, or rename valid references. On failure, report the exact mismatch without changing the manifest to accept an incorrect image. The supplied ZIP importer is only a recovery option for missing originals. After all four pass strict verification, remove `--allow-missing` from CI if still present. Update stale setup notes that claim images are absent or direct sessions to the old branch.
2. Run `npm test`, `npm run check`, and `npm run doctor`. Record Node/npm/Git/Blender versions and the actual Blender executable path. Inspect browser/GPU capability using actual available browser tools; report each check as PASS, FAIL, or BLOCKED. Do not infer GPU performance from RAM or model names.
3. Run `npm run blender:fixture` in the isolated background process, never against an unsaved scene. Record the export result and output path. Validate the GLB header and, when possible, decoded bounds; validate orientation, scale and materials separately in the actual runtime when available. Export or static GLB bounds alone do not prove correct scale in Three.js. Do not create the M1 runtime for this check.
4. Check whether this Codex version accepts and loads the two-agent setting; distinguish native agent availability from effective configuration evidence and mark unavailable inspection BLOCKED. Preserve user-selected model/provider and approval settings.
5. Review the city master and the LEFT rural target in the Godot comparison; record the reference hierarchy and missing-ground-view assumptions.

Acceptance: no missing/corrupt references, bootstrap tests/check pass, Blender export works or a specific blocker is documented, all local readiness claims have evidence. Update STATUS.md. Do not start game content or paid tooling. Stop for review.
