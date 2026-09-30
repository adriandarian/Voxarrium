# Provisional performance budgets

These are review targets, not measured capabilities. Record the actual GPU/browser, resolution, device pixel ratio, backend, commit, world seed, camera and quality tier for every result. Do not infer VRAM from JS heap or call requestAnimationFrame timing GPU timing.

Initial desktop target: 60 FPS at 1920 × 1080 / DPR 1, with p95 total frame duration at or below 16.7 ms once the slice is representative. A 30 FPS reduced-quality mode is a fallback target. Neither is promised before hardware testing. Start with a 20 MB first-playable transfer goal, then revise from real assets. No universal triangle or draw-call ceiling is asserted.

Measure a fixed 60-second route after warmup: frame-duration distribution, long frames, loaded chunks/assets, geometry/material/texture counts, visible instances, active NPCs and JS heap where available. Use GPU timestamps only where supported and clearly record missing measurements. Record upload/compile stalls separately.

At scaling gates, walk across a stream boundary repeatedly, return to the starting position, then check for increasing resources or NPC duplication. Prioritize shared assets, instancing, LOD, spatial culling and fewer shadow-casting lights before removing the art direction's density. Screen-space effects, transparent vegetation and dynamic lights need individual timing.

No benchmark claim from headless software rendering. No quality percentage derived from an uncalibrated image-similarity number.

## M4 measured gate

See `../STATUS.md` for actual Chrome/RX 6950 XT/WebGPU 1080p route data and resource counts. Clear/traced-clear/rain p95 is 13.8/13.9/13.8 ms, while maxima reach 652.8/882.0/881.8 ms. The local p95 target passes; stall-free behavior does not. The actual browser trace finds no single synchronous JavaScript/GC duration explaining the gaps; GPU/OS scheduling is unmeasured and cause remains unresolved. No speculative optimization, streaming or distance LOD is introduced. The five GLBs total 7,130,880 bytes; first-playable network transfer is not measured.
