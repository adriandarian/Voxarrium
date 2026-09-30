# Architecture

M1 implements the runtime boundaries and renderer decision below. World growth and simulation expansion remain proposals, not implemented infrastructure.

## Stack and boundaries
TypeScript + Vite + vanilla Three.js, DOM HUD/settings, and Rapier character physics are implemented in M1. Exact dependency versions are pinned in package.json with a real package-lock.json; use npm ci. Blender GLB remains the asset pipeline. No React is needed for this milestone.

`src/simulation/` owns serializable world, clock, schedules and interaction state. `src/render/` adapts that state to Three.js scene/cameras/materials. `src/physics/` bridges Rapier and simulation. `src/input/` maps actions. `src/ui/` owns DOM overlays. `src/assets/` owns manifest/loading/reference counting. `src/diagnostics/` owns capture and timing. Create modules only as needed, not empty engine hierarchies.

M1 uses a 60 Hz fixed simulation step with interpolated render positions. Catch-up is capped at six steps and pause/blur clears the accumulator. The course is authored deterministic data with stable IDs and seed 104729; the seed identifies this authored fixture and does not randomize its layout. State is plain serializable data, with no Three.js or Rapier objects.

M2 adds `simulation/rural-layout.ts` as the shared meter/palette contract and `simulation/rural.ts` as the authored environment. Optional triangle surfaces in `CourseSpec` drive both visible terrain and static Rapier collision; separate cuboid proxies represent architecture, bridge and significant obstacles. Each course supplies its own recovery bounds. The M1 course and mechanics remain selectable with `?scene=m1`. M2 is the default; `?stage=blockout` exposes structural massing using the same terrain/collision.

`render/rural.ts` owns deterministic environment geometry, vegetation instances and water presentation. `assets/rural.ts` loads the Blender hero GLBs, verifies meter bounds and reports imported material/triangle facts before placement. `render/landscape-materials.ts` creates project-authored pigment textures; it never reads the reference PNGs. Existing renderer initialization, warmup, fallback diagnostics, capture harness and disposal own the new resources. Instance buffers are explicitly disposed as well as shared geometry/material/texture resources.

M2.1 splits botanical geometry and clustered communities into `render/rural-ecology.ts`, with reusable geometry and placement contracts in `render/rural-geometry.ts`. `render/hero-materials.ts` adds generated pigment maps, local UV coordinates and ground-contact colors to the existing GLBs without modifying their position/index data or files. Terrain render triangles receive coplanar subdivision for contextual pigment; the serialized Rapier surfaces remain unchanged. Decorative stone treads replace visible stair cuboids, and a bank gradient replaces visible shore strips; original stair and shoreline collision remains authoritative. These are art treatments over the accepted M2 slice, not new simulation systems.

`src/main.ts` owns startup, DOM settings, clock integration and disposal. `src/cameras/` owns gameplay/debug camera transforms. Physics owns one kinematic capsule for both gameplay views. A development-only `?test=1` harness exposes fixed-step actions and bookmarks for reproducible tests; it is not exposed by the production build. See TESTING.md for evidence and lifecycle coverage.

## Renderer decision gate
Try WebGPURenderer from `three/webgpu`; await initialization and record its actual backend. Its WebGL 2 fallback is not the same as promising every WebGPU feature runs on WebGL. Feature-gate compute-heavy effects, verify fallback and test material compatibility. Start with simple lit materials, sensible color management, directional shadows and fill light. TSL for needed custom shaders; no blanket demand to implement every advanced effect.

Do not mix legacy EffectComposer/ShaderMaterial/onBeforeCompile recipes into WebGPURenderer as though they were interchangeable. See SOURCES.md. If the installed version or GPU fails, record the cause and make one deliberate fallback decision; do not silently label a WebGL result WebGPU.

## Assets, ownership and scale
Explicit manifest IDs; pivots/units/LODs/collision metadata. Reuse resources, instance suitable repeated geometry and dispose by ownership/reference counts. Begin CPU-managed instancing; add GPU culling only after profiling. No one-Object3D-per-blade design.

## World growth
Author a district graph: terrain levels, waterways, paths, bridge connections, lots, navigation and hero landmarks before filling lots. Use a tunable chunk size (initial hypothesis 64 m), hysteresis, prefetch, cancellation and resource release. Separate simulation residency from rendering. Maintain continuity across bridges and terraces; protect active player colliders until replacements are ready.

A single 2D heightfield is insufficient for stacked bridge surfaces and interiors. Treat those as separate geometry/collider/navigation layers. Navmesh generation is a later measured choice, not an unexplained dependency.

## Simulation expansion
One environment state drives time, lighting, wind, cloud/rain, material wetness and audio. NPC tiers: nearby full animation/navigation; local reduced update; unloaded data-only schedule. Stable identities avoid teleport/reset bugs. Weather-aware behavior begins with simple authored shelter destinations, not full live cognition.

Sound starts after a user gesture; attenuation, voice limits and volume categories. Saves are versioned local state (IndexedDB when warranted), not secrets or remote accounts. No server/model API required for the first playable world.
