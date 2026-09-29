# Start Voxarrium in Codex

## Bring down the bootstrap
Use the existing local repository if there is one. Inspect `git status` before switching. Fetch origin, then switch to `bootstrap/voxarrium-foundation` (track the remote branch if needed). Do not overwrite uncommitted work. The bootstrap PR is intentionally not merged automatically.

## Download the reference ZIP
Save the accompanying `Voxarrium-reference-images.zip` in Downloads. It contains the four original PNGs already named and arranged for the repo. From PowerShell in the repo, run `./tools/import-references.ps1`, or let Codex run it during preflight. It will not search unrelated personal folders. Pass `-ArchivePath` if saved elsewhere. Missing files should block art work, not be replaced with invented references.

## One prompt to paste

> Read AGENTS.md, STATUS.md and docs/prompts/00-local-preflight.md. Execute M0 on this checkout, preserving unrelated work. Use at most two concurrent native subagents for genuinely independent tasks, with explicit file ownership; work serially if delegation is unavailable. Import and verify Voxarrium-reference-images.zip from my Downloads folder using the supplied importer. Verify local Node, Git, Blender and browser capabilities, run the existing checks and Blender scale fixture, and record actual results. Do not configure Jev, a paid service, external API keys, or global settings. Do not start the city. When M0 is complete, report the remaining blockers and the exact next M1 prompt; stop for review.

The bootstrap already replaces the earlier giant planning prompt: do not regenerate all its documentation from scratch.

## Environment behavior
`.codex/config.toml` requests a two-child concurrency cap and does not select a model/provider or change permissions. App/version/project trust can affect whether it is loaded; verify rather than assuming. `.agents/skills/` supplies concise project workflows. Instructions do not grant Blender or browser access automatically. No local software was installed from this remote preparation.

## Then
M1 establishes the renderer and human-scale traversal, M2 proves art fidelity, M3 adds life, M4/M5 expand. Each prompt has a review gate; do not run all milestones in one unbounded session.
