# Voxarrium

A living fantasy city for **third-person exploration**, with an optional first-person camera. The eagle-eye reference establishes composition and art direction, not the gameplay camera.

## Start here

**M6 adds the walkable city macro-blueprint at [/?scene=m6](http://127.0.0.1:5173/?scene=m6).** Fourteen authored districts connect the accepted rural/market/workshop content to a 50 m citadel plateau, with a continuous river, four bridge connections, terraces and representative block masses. This is a topology and density review, with production buildings still gated. The default route retains the measured M5.1 corridor for comparison. See [CITY_BLUEPRINT.md](docs/CITY_BLUEPRINT.md) for the graph and assumptions and `STATUS.md` for actual evidence and the human-review gate.

**M5 streams the rural slice, River Market and one modest eastern workshop shell.** The existing market retains 27 buildings, six archetypes, connected streets/alleys, quays, bridges and stairs. Forty-two persistent locals use nearby, loaded and unloaded tiers while weather, time and audio settings continue across boundaries. The shell tests transitions; it is not a finished new district. Historical M5/M5.1 results are preserved under `docs/history/`; the current M6 gate is in `STATUS.md`. The resident comparison is `/?scene=m4`, the rural slice `/?scene=m2`, and the M1 course `/?scene=m1`.

The runtime uses TypeScript + Vite + vanilla Three.js and Rapier. Dependencies are pinned in `package.json` and `package-lock.json`. WebGPURenderer reports the backend that actually initialized; `/?backend=webgl` deliberately selects its WebGL 2 backend.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ and click **Explore the market** to activate controls and local audio. Mouse capture is used when available; if the browser refuses it, hold the left mouse button and drag to look. WASD moves, Shift runs, Space jumps, V switches third/first person, F opens/closes nearby dialogue or landmark text, R recovers to spawn, and Esc pauses/releases the mouse. Keys 1–4 select third person, first person, free/debug and eagle-eye. In free camera, Q/E moves down/up. Pause settings expose FOV, sensitivity, and “Weather, light & sound”: weather/lighting presets, reduced motion and master/category volume. Reload starts the same clear/day district; settings/saves are not persisted. Building doors have reachable thresholds and future interior hooks; they currently remain closed.

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

`npm run capture:m5` records the shell from eagle-eye, third-person and first-person after traversal. `npm run capture:m4` retains district views, `npm run capture:m3` rural living evidence, `npm run capture` M2, and `npm run capture:m1` M1. `npm run measure:tail` repeats the bounded M4 timing experiment; `npm run stress:streaming` runs three actual-input M5 circuits. See `docs/TESTING.md` for measurement controls and limitations. Local Blender generators remain `npm run blender:rural` and `npm run blender:district`; sources/metadata and reference hashes are preserved.

`npm run capture:m6` records the canonical city overview, district/water/streaming maps, debug cameras and three paired street views after continuous traversal. In the development city scene, the pause menu also offers city review cameras and overlays; those extra controls are absent from production. With the dev server running, `node tools/stress-city.mjs` runs one bounded actual-input rural-to-central-market-and-back circuit. Its proxy timings do not predict production-city performance.

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
