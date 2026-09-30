# Voxarrium

A living fantasy city for **third-person exploration**, with an optional first-person camera. The eagle-eye reference establishes composition and art direction, not the gameplay camera.

## Start here

**M2 is an authored 96 × 96 meter rural art slice.** The cottage, garden, elevated wheat field, stairs and river crossing use the M1 third/first-person player, physics, cameras and diagnostics. The M1 64 × 64 meter test course remains at `/?scene=m1`. See `STATUS.md` for actual art-review status, tested scope and measurements; a running scene is not automatic art approval.

The runtime uses TypeScript + Vite + vanilla Three.js and Rapier. Dependencies are pinned in `package.json` and `package-lock.json`. WebGPURenderer reports the backend that actually initialized; `/?backend=webgl` deliberately selects its WebGL 2 backend.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ and click **Explore the garden**. Mouse capture is used when available; if the browser refuses it, hold the left mouse button and drag to look. The HUD shows the active control. WASD moves, Shift runs, Space jumps, V switches third/first person, R recovers to spawn, and Esc pauses/releases the mouse. Keys 1–4 select third person, first person, free/debug and eagle-eye. In free camera, Q/E moves down/up. Pause settings expose FOV and mouse sensitivity; head bob is off.

```sh
npm test
npm run check
npm run build
npm run test:browser
npm run capture
npm run doctor
npm run references:verify
```

Node.js 22.12+ is the project minimum. Browser tests use installed Google Chrome by default, without downloading another browser. Set `VOXARRIUM_BROWSER=msedge` to use installed Edge; Edge has not been validated for this milestone. Set `VOXARRIUM_HEADED=1` for a visible test browser and local GPU baseline. `npm run preview` serves the built runtime at http://127.0.0.1:4173/. Nothing is deployed publicly.

Tests and capture states/screenshots live under ignored `artifacts/`. See `docs/TESTING.md` for the exact procedure and evidence limits. `doctor` records local tooling under `.local/`; it does not test gameplay. The committed calibration GLB makes normal startup independent of Blender. `npm run blender:fixture` re-exports to `.local/assets/` for pipeline work; see `docs/ASSET_PIPELINE.md` before replacing the vendored fixture.

`npm run capture` records M2; `npm run capture:m1` preserves the original M1 evidence procedure. `/?stage=blockout` exposes the structural massing for comparison. The local Blender hero generator is `npm run blender:rural`; sources and export metadata are preserved alongside the shipped GLBs. Original reference images stay outside runtime assets.

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
- `docs/ARCHITECTURE.md`, `docs/WORLD_SCALE.md`: runtime and scale contracts, with future proposals labeled.
- `docs/prompts/`: bounded milestone prompts; read STATUS first and stop at its review gate.
- `tools/`: dependency-free setup checks and Blender calibration.
- `.agents/skills/`: small project-specific Codex workflows.

No Jev, external model API, cloud service, automatic deployment, or paid asset dependency is configured. Existing account usage limits still apply to Codex. No license has been selected for this project or the supplied reference artwork.
