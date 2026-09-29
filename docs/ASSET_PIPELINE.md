# Asset pipeline

Author/source: `assets/source/`; generator scripts: `tools/blender/`; local generated fixtures: `.local/assets/`; final reviewed runtime files: `public/assets/`. Reference images remain documentation and must not inflate the runtime build.

M0 runs `npm run blender:fixture`. The launcher finds BLENDER_PATH, Blender on PATH, or standard installation locations, then launches an isolated background factory session. It does not touch an open scene or existing .blend file. It exports a labeled 1 m cube to `.local/assets/scale-fixture.glb`. This is a pipeline calibration asset, NOT a cottage or art-quality proof.

Use one meter scale, apply relevant mesh transforms deliberately, preserve armature/animation semantics, and make pivots meaningful (door hinge, tree base, module snap origin). Confirm axis orientation in the runtime. Name parts stably; add simple collision proxies separately. Full facade, roof thickness, backs and sides are required at player distance.

After one hero cottage and bridge are approved at close range, derive a small kit: roof pieces, plaster/timber walls, openings, chimney, stone, fences and props. Avoid mass-producing generic low-poly assets before quality review.

Export GLB/glTF 2.0; keep materials compatible with the tested runtime. Bake Blender-only procedural materials when needed, without baking a fixed sun into base color for a day/night world. Optimize through measured deduplication, geometry simplification and appropriate texture compression. Meshopt/Draco/KTX2 require corresponding loaders and verified tradeoffs; do not apply every compressor by default.

Each shipped asset record needs ID, source/generator, license/provenance, bounds/scale, triangle/material/texture counts, collision/LOD policy and preview views. Do not assume user-supplied reference art carries redistribution or commercial rights. No automatic asset downloads or purchases.

The launcher is cross-platform. Set BLENDER_PATH to the executable path if discovery fails; do not install an MCP bridge or expose Blender on a network port for this bootstrap.
