# Start Voxarrium in Codex

## Use the current checkout
M1 has now been implemented on `milestone/m1-human-scale-foundation`. Read `STATUS.md` first for the current review gate; do not replay the historical M0 prompt below or start M2 without owner review. For local play use `npm ci` and `npm run dev`; README.md documents controls and checks.

### Historical M0 handoff
The bootstrap and original reference PNGs have been merged into `main`. Inspect `git status` and the current branch first; preserve unrelated work and use the current setup branch (`setup/local-preflight` for M0). Do not return to the old bootstrap branch. For a fresh checkout, create the setup branch from the pulled `main`.

## Verify the committed references
Run `npm ci`, then `npm run references:verify`. All four original PNGs should already be under `docs/reference/`. Do not replace, regenerate, resize, or rename valid references. Report exact missing-file, size, dimension, signature, or checksum failures; never alter the manifest to make a different image pass. Only consider the supplied ZIP importer if an original is actually missing; see `docs/reference/README.md` for recovery.

## One prompt to paste

> Read AGENTS.md, STATUS.md and docs/prompts/00-local-preflight.md. Execute M0 only on this checkout, first inspecting git status and the current branch and preserving unrelated work. Use at most two concurrent native subagents for independent read-only environment and reference reviews; the parent owns edits and integration, with no recursive delegation. Run npm ci, npm run references:verify, npm test, npm run check, npm run doctor, and npm run blender:fixture. Verify the four committed PNGs before considering import and preserve the originals and manifest. Record the actual Blender executable, isolated calibration export and output path; distinguish static GLB checks from Three.js runtime validation. Inspect available browser/GPU tools and report unavailable checks as BLOCKED. Make CI reference verification strict after all four pass; update stale setup notes and STATUS.md with PASS, FAIL, or BLOCKED and evidence. Preserve selected model/provider and approval settings. Do not configure Jev, paid services, API keys, image generation, global settings, or deployment. Stop at the M0 review gate; do not start M1 or city content.

The bootstrap already replaces the earlier giant planning prompt: do not regenerate all its documentation from scratch.

## Environment behavior
`.codex/config.toml` requests a two-child concurrency cap and does not select a model/provider or change permissions. App/version/project trust can affect whether it is loaded; verify rather than assuming. `.agents/skills/` supplies concise project workflows. Instructions do not grant Blender or browser access automatically. No local software was installed from this remote preparation.

## Then
M1 establishes the renderer and human-scale traversal, M2 proves art fidelity, M3 adds life, M4/M5 expand. Each prompt has a review gate; do not run all milestones in one unbounded session.
