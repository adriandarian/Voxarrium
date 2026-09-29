# Voxarrium status

## Current milestone
M0 — local preflight executed on 2026-09-28 (America/Los_Angeles; doctor timestamp `2026-09-29T00:51:20.554Z`). Stopped at the M0 review gate with the specific inspection blockers below. M1 has not started.

Initial `git status --short` was clean and `git branch --show-current` reported `main` at `dc10fe30779b637d9623de0811df8bd70ef0b66e`. The requested setup branch was absent from local/remote-tracking refs and the worktree list, so it was created from that checkout with `git switch -c setup/local-preflight`. No old-bootstrap checkout or unrelated work was changed. M0 edits remain local on `setup/local-preflight`.

## Local checks

| Check | Result | Actual evidence / scope |
| --- | --- | --- |
| `npm ci` | PASS | Existing dependency-free lockfile installed; audited 1 package, 0 vulnerabilities. No runtime dependencies added. |
| `npm run references:verify` | PASS | All four originals match the unchanged manifest: PNG signature, byte count, dimensions and SHA-256; no missing files or errors. No import or image mutation needed. |
| `npm test` | PASS | 9/9 Node bootstrap tests, including missing/corrupt reference behavior and repository contracts. |
| `npm run check` | PASS | Bootstrap repository contracts and tool syntax. This is not a game build or GPU test. |
| `npm run doctor` | PASS | Supported Node, Git, Blender and references found; report at `.local/doctor.json`. Doctor itself reports browser/GPU NOT TESTED and runtime NOT IMPLEMENTED. |
| `npm run blender:fixture` | PASS | Isolated factory background process exited 0; calibration export and GLB v2 header/length validation passed. Output details below. |
| Static GLB bounds inspection | PASS | Independent Node decode of binary POSITION values matched accessor bounds; identity rotation/scale and translation yield a 1 x 1 x 1 cube resting at Y=0. This is file-level evidence only. |
| Strict CI reference configuration | PASS | `.github/workflows/bootstrap-checks.yml` now runs `npm run references:verify` without `--allow-missing`, after all four committed originals passed. Hosted CI has not been run for these local edits. |
| Native browser discovery | PASS | `cua.getState()` exposed Chrome via its extension and the Codex in-app browser. Installed browser versions were read locally. |
| Windows GPU inventory | PASS | `Get-CimInstance Win32_VideoController` reported AMD Radeon RX 6950 XT, driver `32.0.21045.5002`, status OK. Inventory alone does not verify browser rendering or performance. |
| Browser GPU diagnostics | BLOCKED | `cua.createBrowserTab("chrome", "chrome://gpu", ...)` was rejected by browser URL security policy (only HTTP/HTTPS allowed; workarounds forbidden). No bypass attempted. |
| Actual WebGPU/backend initialization and WebGL fallback | BLOCKED | No M1 Three.js runtime exists. No supported backend, fallback, GPU timings or gameplay performance claim. |
| Three.js fixture scale, axes and materials | BLOCKED | No actual runtime/viewer validation performed. Successful export and static bounds do not prove runtime scale or visual orientation/materials. |
| Two native read-only child audits | PASS | Environment-readiness and reference-audit children ran with no edits or recursive delegation; parent performed all edits/integration. |
| Effective project agent setting | BLOCKED | `.codex/config.toml` still contains `[agents] max_threads = 2`. Active desktop binary help/version were inspected, but effective loading/enforcement is not exposed by a narrow read-only inspection command. Two working children do not prove this file was loaded. |
| Source-reference hierarchy review | PASS | Master and LEFT rural target inspected after integrity verification; observations and missing-ground-view assumptions recorded in `docs/reference/REVIEWS.md`. |
| Runtime art review and traversal | BLOCKED | No scene or runtime captures exist; eagle-eye, third-person and first-person review remain later gates. |
| Final local diff audit | PASS | `git diff --check` passed. References, manifest, package files and `.codex/config.toml` have no diff; all four PNGs are tracked. Tests, repository check and strict reference verification were rerun successfully after the CI/documentation edits. |

## Actual local tools

- Node `v22.16.0`: `C:\Program Files\nodejs\node.exe`; npm `10.9.2` via `C:\Program Files\nodejs\npm.ps1`; Git `2.39.2.windows.1`: `C:\Program Files\Git\cmd\git.exe` (version commands executed).
- Blender `5.2.1 LTS`, build hash `9e2066aef7ef`: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. `findBlender()` found the standard installation even though Blender is absent from PATH.
- Installed Chrome `154.0.8037.57` and Edge `155.0.4283.18` from executable version metadata; these are inventory results, not browser/GPU initialization tests.
- Active desktop Codex binary `C:\Users\hello\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe` reports `codex-cli 0.158.0-alpha.2.1`. The separate PATH CLI reports `0.92.0` and was not used as evidence of desktop configuration support.
- Selected model/provider, approval controls, project configuration and global settings were not changed. No Jev, API keys, paid services, image generation, deployment, software installation or persistent background loop was configured.

## Blender calibration evidence

`npm run blender:fixture` invokes the discovered executable with `--background --factory-startup --python-exit-code 1 --python tools/blender/scale_fixture.py -- --output <absolute output path>`, with a 120-second timeout and hidden process window. It ran in its own process and did not operate on an open or unsaved scene.

- Output: `C:\Users\hello\Projects\Voxarrium\.local\assets\scale-fixture.glb` (ignored local artifact), 1,892 bytes.
- SHA-256: `f5012e60abdc2726ea9949d3c2a0d6eb9ec0343c462e437636c58dc42845aac2`.
- glTF generator: `Khronos glTF Blender I/O v5.2.40`; node `fixture_cube_1m`; asset ID `diagnostics.scale-cube`; 24 position vertices.
- Decoded mesh bounds: `[-0.5, -0.5, -0.5]` to `[0.5, 0.5, 0.5]`; translation `[0, 0.5, 0]`, identity rotation/scale; resulting bounds `[-0.5, 0, -0.5]` to `[0.5, 1, 0.5]`.
- Header, chunk lengths, decoded positions and accessor bounds were checked with Node assertions. Runtime scale/axis/material inspection remains BLOCKED. A symmetric cube also cannot establish every directional-axis convention visually.

## References

All four original PNGs are already committed under `docs/reference/`, outside shipped assets. Full hashes remain in the unchanged `docs/reference/manifest.json`; independent byte/dimension/hash checks and the strict repository verifier agree.

| Reference | Dimensions | Bytes | Result |
| --- | --- | --- | --- |
| `city-master.png` | 483 x 809 | 1,020,672 | PASS |
| `experiments/godot-attempt.png` | 973 x 849 | 1,760,211 | PASS |
| `experiments/unreal-attempt.png` | 1351 x 2048 | 5,529,335 | PASS |
| `experiments/blender-attempt.png` | 1526 x 910 | 2,462,715 | PASS |

The city master is the primary composition/palette reference. LEFT in the Godot comparison is the rural target; RIGHT and the Unreal/Blender images are earlier attempts. Exact ground-level dimensions, rear/side facades, interiors and bridge clearances remain design assumptions. No source image was imported, renamed, resized, replaced or regenerated; the manifest was not changed.

## Present and remaining gate

The repository has product/art/scale/architecture documents, bounded subagent instructions, verified originals, bootstrap checks, strict CI reference verification and a local Blender calibration export. Historical remote checks remain in `docs/BOOTSTRAP_VALIDATION.md`; they are distinct from the local results above.

No city, Three.js runtime, player controller, NPCs, weather, audio, world streaming, gameplay build/test or visual-fidelity result exists. No runtime screenshots or performance measurements were captured. Targets in `docs/PERFORMANCE_BUDGETS.md` remain proposals. The PowerShell ZIP recovery importer was unnecessary and was not exercised in this run.

Next action: owner review of M0 results and blockers. Only after that gate, use `docs/prompts/01-human-scale-foundation.md` for M1 and validate the initialized renderer backend, fallback, fixture scale/axes/materials and three camera modes there. Do not begin M1 automatically.
