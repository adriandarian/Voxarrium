# Voxarrium

A living fantasy city for **third-person exploration**, with an optional first-person camera. The eagle-eye reference establishes composition and art direction, not the gameplay camera.

## Start here

Open `docs/CODEX_START_HERE.md`. The repository contains a preproduction foundation, executable local checks, Blender calibration tooling, and gated implementation prompts. **It is not a playable game yet.**

The planned runtime is TypeScript + vanilla Three.js, with Blender-authored GLB assets and Rapier physics. Runtime packages and renderer behavior must be verified and locked on the development machine during M1; no speculative version numbers are baked into this bootstrap.

```sh
npm ci
npm run doctor
npm test
npm run check
npm run references:verify
npm run blender:fixture
```

Node.js 22.12+ is the project minimum. The bootstrap has no third-party npm dependencies. `doctor` records diagnostics under ignored `.local/` and reports missing Blender rather than installing anything.

## Reference images

The four full-resolution original PNGs are committed under `docs/reference/`. Verify the existing files before considering any import:

```sh
npm run references:verify
```

Verification checks PNG signatures, byte counts, dimensions, and SHA-256 checksums against the unchanged manifest. Preserve valid originals exactly. If verification fails, report the exact mismatch; do not change the manifest to accept an incorrect image. The ZIP importer remains a recovery tool for missing originals. See `docs/reference/README.md`.

## Development map

- `AGENTS.md`: concise permanent instructions and parallel-work rules.
- `STATUS.md`: current reality and next gate.
- `docs/VISION.md`, `docs/ART_DIRECTION.md`: product and art constraints.
- `docs/ARCHITECTURE.md`, `docs/WORLD_SCALE.md`: proposed technical contracts.
- `docs/prompts/`: bounded milestone prompts; start with 00, not the whole city.
- `tools/`: dependency-free setup checks and Blender calibration.
- `.agents/skills/`: small project-specific Codex workflows.

No Jev, external model API, cloud service, automatic deployment, or paid asset dependency is configured. Existing account usage limits still apply to Codex. No license has been selected for this project or the supplied reference artwork.
