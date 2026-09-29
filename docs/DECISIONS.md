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
