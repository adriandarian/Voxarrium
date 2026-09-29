# M1 — renderer, capture harness and human-scale graybox

Require M0 evidence. Read AGENTS.md, ARCHITECTURE.md, WORLD_SCALE.md and TESTING.md. Implement a small runnable foundation, not the city.

Parent checks official current APIs, selects and pins compatible Three.js, TypeScript, Vite, typings, Rapier and browser-test packages, then commits a real lockfile. Do not use invented versions. Define shared lifecycle/input/camera/state interfaces before splitting work.

Delegate at most two independent bounded tasks: (A) rendering/capture harness and (B) player/controller/cameras, each with disjoint file ownership. Parent owns package files, shared interfaces and integration. No recursive delegation; serial work is valid when dependencies overlap.

Start a 64 m graybox: ground, slope, stairs, doorway, low ceiling, narrow alley, bridge and drop edge. Default third-person walking/running/jumping with gravity, slope/step handling and camera obstruction. Add settings-selectable first-person over the same character and world, plus debug/eagle-eye cameras. Map actions explicitly; release pointer lock and suspend input on menus/blur.

Use WebGPURenderer only after real capability testing, record actual backend, handle startup failure, resize, DPR cap, disposal and tab suspension. Keep materials/lighting simple. No expensive effects yet. Implement asset-ready deterministic capture and real typecheck/build/tests; capture eagle-eye, third-person, first-person and a traversal route. Use actual browser inspection; no screenshots means unverified visual behavior.

Acceptance: scale fixture agrees in Blender and runtime, no wall/camera clipping on the test course, real build/tests pass, backend and performance baseline recorded without overclaiming. Update STATUS.md and stop for review.
