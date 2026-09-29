# Remote bootstrap validation — 2026-09-28

Executed in the preparation container, not on the owner's PC:

- Node v22.16.0, npm 10.9.2; dependency-free lockfile generated/validated by npm in offline mode.
- `npm test`: 9/9 passing (reference integrity and repository/tool contracts).
- `npm run check`: passing (expected docs/config and Node tool syntax).
- `npm run references:verify`: four original PNG hashes, sizes and dimensions passing after copying originals into the working container.
- Reference ZIP: exactly four permitted PNG entries; each matches its manifest SHA-256.
- Blender Python script: syntax compilation passed.
- Doctor and Blender fixture launcher: ran and correctly reported Blender absent in this container. No GLB export has been executed here.
- PowerShell importer: prepared and reviewed, but not executed; PowerShell is absent in this container. Run locally before treating Windows import as verified.
- Browser/WebGPU, Three.js build, controller, visual comparisons, local Codex agent configuration: not tested or not implemented yet.

GitHub initial commit intentionally contains text/config/tooling only. The original-image gate still needs the accompanying ZIP imported and committed on the owner's machine. Passing bootstrap CI is NOT passing a runtime or visual-quality gate. No dependencies, global settings, credentials or software on the owner's machine were changed.
