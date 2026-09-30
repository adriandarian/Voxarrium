# Architecture

M1 established the runtime boundaries and renderer decision below. M2–M4 implement the rural/living slice and one authored district; larger-world streaming and residency infrastructure remain proposals.

## Stack and boundaries
TypeScript + Vite + vanilla Three.js, DOM HUD/settings, and Rapier character physics are implemented in M1. Exact dependency versions are pinned in package.json with a real package-lock.json; use npm ci. Blender GLB remains the asset pipeline. No React is needed for this milestone.

`src/simulation/` owns serializable world, clock, schedules and interaction state. `src/render/` adapts that state to Three.js scene/cameras/materials. `src/physics/` bridges Rapier and simulation. `src/input/` maps actions. `src/ui/` owns DOM overlays. `src/assets/` owns manifest/loading/reference counting. `src/diagnostics/` owns capture and timing. Create modules only as needed, not empty engine hierarchies.

M1 uses a 60 Hz fixed simulation step with interpolated render positions. Catch-up is capped at six steps and pause/blur clears the accumulator. The course is authored deterministic data with stable IDs and seed 104729; the seed identifies this authored fixture and does not randomize its layout. State is plain serializable data, with no Three.js or Rapier objects.

M2 adds `simulation/rural-layout.ts` as the shared meter/palette contract and `simulation/rural.ts` as the authored environment. Optional triangle surfaces in `CourseSpec` drive both visible terrain and static Rapier collision; separate cuboid proxies represent architecture, bridge and significant obstacles. Each course supplies its own recovery bounds. The M1 course and mechanics remain selectable with `?scene=m1`; the rural slice remains selectable with `?scene=m2`. M4 is now the default; `?stage=blockout` exposes structural massing using the same terrain/collision.

`render/rural.ts` owns deterministic environment geometry, vegetation instances and water presentation. `assets/rural.ts` loads the Blender hero GLBs, verifies meter bounds and reports imported material/triangle facts before placement. `render/landscape-materials.ts` creates project-authored pigment textures; it never reads the reference PNGs. Existing renderer initialization, warmup, fallback diagnostics, capture harness and disposal own the new resources. Instance buffers are explicitly disposed as well as shared geometry/material/texture resources.

M2.1 splits botanical geometry and clustered communities into `render/rural-ecology.ts`, with reusable geometry and placement contracts in `render/rural-geometry.ts`. `render/hero-materials.ts` adds generated pigment maps, local UV coordinates and ground-contact colors to the existing GLBs without modifying their position/index data or files. Terrain render triangles receive coplanar subdivision for contextual pigment; the serialized Rapier surfaces remain unchanged. Decorative stone treads replace visible stair cuboids, and a bank gradient replaces visible shore strips; original stair and shoreline collision remains authoritative. These are art treatments over the accepted M2 slice, not new simulation systems.

`src/main.ts` owns startup, DOM settings, clock integration and disposal. `src/cameras/` owns gameplay/debug camera transforms. Physics owns one kinematic capsule for both gameplay views. A development-only `?test=1` harness exposes fixed-step actions and bookmarks for reproducible tests; it is not exposed by the production build. See TESTING.md for evidence and lifecycle coverage.

## Renderer decision gate
Try WebGPURenderer from `three/webgpu`; await initialization and record its actual backend. Its WebGL 2 fallback is not the same as promising every WebGPU feature runs on WebGL. Feature-gate compute-heavy effects, verify fallback and test material compatibility. Start with simple lit materials, sensible color management, directional shadows and fill light. TSL for needed custom shaders; no blanket demand to implement every advanced effect.

Do not mix legacy EffectComposer/ShaderMaterial/onBeforeCompile recipes into WebGPURenderer as though they were interchangeable. See SOURCES.md. If the installed version or GPU fails, record the cause and make one deliberate fallback decision; do not silently label a WebGL result WebGPU.

## Assets, ownership and scale
Explicit manifest IDs; pivots/units/LODs/collision metadata. Reuse resources, instance suitable repeated geometry and dispose by ownership/reference counts. Begin CPU-managed instancing; add GPU culling only after profiling. No one-Object3D-per-blade design.

## World growth
M4 implements one authored district, without streaming or procedural city generation. `simulation/district-layout.ts` owns explicit lots/archetypes, street graph, plaza, bridges, elevation/stair contracts, gardens, stable entrance hooks and the reproducible route. `simulation/district.ts` appends terrain and collision proxies to the unchanged rural course; the same player/controller/camera traverses both. `docs/DISTRICT_NAVIGATION.md` describes actual clearance and route tests.

`assets/district.ts` validates the local Blender GLB library; `render/district.ts` composes complete 3D buildings and batches repeated module/material primitives into InstancedMesh resources. Roof bounds are supplied per building to the existing rain system. A shared landscape-material adapter gives district trees/plants the same TSL wind and wetness state. Four district PointLights plus the existing garden light have no local shadow maps. The existing directional sun still owns the shadow pass. Disposal covers instance buffers, imported resources, shared materials and generated pigment textures.

`simulation/district-npcs.ts` supplies 36 authored locals with roles, different route/dwell timings and actual tested shelter connections. Together with the original six, 42 locals advance at the existing fixed step. The existing rendering tiers reduce distant limb updates, not simulation residency; no unloaded schedule tier is implemented. District interaction adds closed entrance hooks, without an interior system. District audio extends the same category graph with two localized market loops, nearby workshop impacts, door cues and extended canal attenuation. Five loops and at most five transient voices are bounded.

The following larger-world infrastructure remains a proposal:

Author a district graph: terrain levels, waterways, paths, bridge connections, lots, navigation and hero landmarks before filling lots. Use a tunable chunk size (initial hypothesis 64 m), hysteresis, prefetch, cancellation and resource release. Separate simulation residency from rendering. Maintain continuity across bridges and terraces; protect active player colliders until replacements are ready.

A single 2D heightfield is insufficient for stacked bridge surfaces and interiors. Treat those as separate geometry/collider/navigation layers. Navmesh generation is a later measured choice, not an unexplained dependency.

## Simulation expansion
M3 implements `simulation/environment.ts` as the authoritative serializable clear/cloudy/rain and day/dusk/night state. Four-second lighting/weather blends, wind, cloud coverage, rain, wetness and animation time advance only at fixed simulation ticks. Pausing freezes these values. Time presets are bounded authored states, not an accelerated astronomical clock. `render/environment.ts` applies the state to existing directional/fill lights, TSL vegetation displacement, surface wetness, conservative roof-clipped rain and a small distant cloud batch. It preserves source geometry, instance transforms, textures and collision; disposal restores original materials before normal scene cleanup. The existing water surface responds to wind/rain. Reduced mode lowers rain/cloud counts, uses one wind harmonic and updates water at 15 Hz.

`simulation/npcs.ts` owns six named locals, authored dialogue and a deterministic waypoint graph confined to the accepted cottage terrace. Day/dusk routes idle and walk; rain/night sends them via connected graph edges to existing cottage eaves. Paths are tested against actual Rapier capsule overlaps and ground rays. Locals have no dynamic collider or crowd avoidance; they remain nonblocking. `render/npcs.ts` owns solid all-side figures and limb poses: nearby full updates, distant 4 Hz, reduced nearby 8 Hz. `simulation/interaction.ts` selects nearby NPCs or two existing landmarks by three-dimensional reach; F opens/closes local text and pauses the addressed NPC's route. Leaving reach or pausing closes the panel.

`audio/audio.ts` creates Web Audio only from Explore/Resume's click. Deterministic filtered noise supports wind/river/rain; spatial PannerNodes follow the player/listener, footsteps distinguish authored surface regions, and short tonal cues accompany nearby locals/interactions. Master/ambience/footsteps/local controls and pause mute use gain ramps. Three ambient loops plus at most five transient voices are bounded; all nodes/sources/context are explicitly released. Development-only internal recording supplies audio evidence without a microphone. Sound is procedural, with no recorded speech. M3 does not need a persistent save UI: state serialization/continuation is tested, and each reload deliberately starts the same clear/day slice and settings.

One environment state drives time, lighting, wind, cloud/rain, material wetness and audio. NPC tiers: nearby full animation/navigation; local reduced update; unloaded data-only schedule. Stable identities avoid teleport/reset bugs. Weather-aware behavior begins with simple authored shelter destinations, not full live cognition.

Sound starts after a user gesture; attenuation, voice limits and volume categories. Saves are versioned local state (IndexedDB when warranted), not secrets or remote accounts. No server/model API required for the first playable world.
