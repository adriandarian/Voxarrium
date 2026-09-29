# M3 — make the approved slice alive

Require the M2 art-review gate. Keep the slice size fixed. Split at most two tasks with explicit interfaces: environment state/visuals/audio hooks, and NPC navigation/animation/interactions. Parent integrates and verifies.

One authoritative time/weather state drives sun/moon, clouds, wind, rain, surface wetness, vegetation and ambient audio. Begin clear/cloudy/rain transitions; add storms only after stable budgets. Nearby four to eight NPCs have authored local dialogue, deterministic daily routes and simple shelter behavior. No live LLM inference. Doors/usable props need real interaction states and collision behavior.

Spatial audio starts only after a user gesture; include river, wind, footsteps by surface, doors and quiet NPC ambience, with master/category controls. Limit concurrent voices. Every animated effect must have a reduced-quality path. Add local versioned save/load for player/time/settings as needed.

Acceptance: moving third-person and first-person inspection, noon/dusk/night/rain captures, NPC route/interaction tests, audible local verification, reset/pause/resume tests and measured performance. Preserve approved art. Update STATUS.md and stop before city generation.
