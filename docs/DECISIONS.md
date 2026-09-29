# Decision log

## 2026-09-28 — Bootstrap
- Third-person is the primary game camera; first-person shares the world; eagle-eye is art/debug.
- Blender + GLB and vanilla Three.js are the intended pipeline. Validate the renderer/backend locally before committing to advanced effects.
- One rural slice is the first art gate. Scale and composition precede clutter; visual approval precedes district expansion.
- Two concurrent subagents maximum by default, no recursive delegation, explicit ownership and parent integration. No paid provider or Jev configuration.
- Keep bootstrap dependencies empty; choose/pin actual runtime package versions in M1 with registry access and a real lockfile. No claimed r186 requirement.
- Preserve the four source PNGs unchanged in a checksum-verified local overlay. Initial connector-based commit cannot include the multi-megabyte original binaries through a mounted-file upload route. Import and commit locally at M0.
- Keep source/reference licenses unassigned until the owner decides; do not silently add MIT or other licensing.

Append new decisions with alternatives, evidence and rollback conditions. Do not rewrite history to imply a proposal was validated.
