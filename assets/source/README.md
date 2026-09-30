# Source assets
`rural-hero.blend` is the editable M2 cottage, shed and bridge source. `rural-hero.report.json` records local Blender export bounds, counts, hashes, material names and provenance. The deterministic generator is `tools/blender/rural_hero.py`, invoked through `npm run blender:rural`. Preserve manual source edits before deliberately regenerating this file.

The three exported GLBs are vendored under `public/assets/rural/`; their checksums and collision policies are in `assets/manifest.json`. They have been inspected in the real runtime from eagle-eye and both gameplay cameras. Human art approval is still pending; successful export does not imply reference fidelity.

Keep .blend backups, caches and reference images out of runtime bundles. Reference originals remain under `docs/reference/`. See `docs/ASSET_PIPELINE.md` and `docs/reference/REVIEWS.md` for the workflow and remaining visual differences.
