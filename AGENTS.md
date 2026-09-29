# Voxarrium agent instructions

Read `STATUS.md` and the relevant milestone prompt first. Consult `docs/VISION.md`, `docs/ART_DIRECTION.md`, and the relevant architecture section; do not reload every document for every trivial edit.

## Non-negotiable product constraints

- Build a human-scale third-person exploration game; first-person is a settings option over the same world. Eagle-eye is an art/debug camera, not the game.
- Review art from eagle-eye, third-person, and first-person views. A one-angle diorama or camera-facing facade is not acceptable.
- Target the master reference, not the shortcomings of the earlier experiments. Avoid generic low-poly grids, uniformly tiled ground, identical crowns, exposed block seams everywhere, and uniformly randomized clutter.
- Treat a single image as incomplete art direction, not exact geometry. Invent unseen street-level details coherently and label assumptions.
- Prove one small playable slice before expanding the city. Do not trade navigation for screenshot similarity or hide missing work with fog/post-processing.

## Execution and cost

Use native subagents when explicitly requested and helpful: at most two concurrent children by default, no recursive delegation. Assign disjoint file ownership and acceptance tests before spawning. The parent owns shared interfaces, dependency manifests, integration, and STATUS.md. Subagents return paths, tests, risks, and concise conclusions. A subagent is not automatically an isolated worktree; use actual worktree isolation when needed. If unavailable, work serially and say so.

No Jev, API keys, paid services, asset purchases, model-provider changes, global Codex changes, or remote deployment without permission. Keep human approval/sandbox controls intact. Do not start background loops or repeatedly retry failed exports/builds without diagnosis. No fabricated performance, visual scores, tool use, or completion claims.

## Engineering

Simulation state is serializable and separate from render objects. Start simple: TypeScript + Vite + vanilla Three.js; DOM UI; GLB assets; Rapier when locomotion starts. Pin versions after checking official documentation and committing a real lockfile. WebGPU is a proposed primary backend, not a guaranteed performance win. Verify initialized backend and test fallback separately. Do not mix legacy EffectComposer/GLSL patches into a TSL pipeline without a deliberate compatibility decision.

Use meters, stable asset IDs, deterministic seeds, explicit disposal and collision proxies. Preserve the source-image hashes. Reference images stay under docs, outside shipped public assets.

## Checks and handoff

Bootstrap commands: `npm test`, `npm run check`, `npm run doctor`, `npm run references:verify`. `npm run blender:fixture` exports a calibration asset locally when Blender is available. There is no runtime build or browser test until M1 creates it; never imply bootstrap CI tests gameplay.

Before editing, inspect git status and current branch; preserve unrelated work. Do not force-push, merge, change repository access, or overwrite user files. Finish with exact tests run, blockers, screenshots if actually captured, and a factual STATUS.md update. Stop at the milestone review gate.
