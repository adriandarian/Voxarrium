# Proposed architecture

This is a bounded proposal to verify on the local machine, not implemented infrastructure.

## Stack and boundaries
TypeScript + Vite + vanilla Three.js. DOM HUD/settings first; no React dependency unless later UI complexity warrants it. Rapier for player physics; asset authoring in Blender, runtime GLB/glTF. Choose and pin compatible package versions in M1, produce package-lock.json, then use npm ci. Bootstrap currently has no third-party dependencies.

`src/simulation/` owns serializable world, clock, schedules and interaction state. `src/render/` adapts that state to Three.js scene/cameras/materials. `src/physics/` bridges Rapier and simulation. `src/input/` maps actions. `src/ui/` owns DOM overlays. `src/assets/` owns manifest/loading/reference counting. `src/diagnostics/` owns capture and timing. Create modules only as needed, not empty engine hierarchies.

Use a capped fixed simulation timestep with render interpolation when gameplay begins; cap catch-up after tab suspension. Stable seeded generation; async work must not make IDs nondeterministic. No save files containing Three.js objects.

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
