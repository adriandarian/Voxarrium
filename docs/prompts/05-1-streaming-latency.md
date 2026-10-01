Complete Voxarrium M5.1: eliminate gameplay-blocking district-streaming stalls while preserving M5 lifecycle correctness.
Confirm:
- current branch is milestone/m5-1-streaming-latency
- working tree is clean
- accepted M5 has been merged
Read:
- AGENTS.md
- STATUS.md
- docs/ARCHITECTURE.md
- docs/PERFORMANCE_BUDGETS.md
- docs/TESTING.md
- the M5 streaming implementation and profiling evidence
Objective
M5 proved lifecycle correctness but exposed unacceptable streaming stalls of approximately 1.6 seconds during real traversal.
This milestone has ONE purpose:
Make transitions between the existing three areas sufficiently incremental/prepared that ordinary player traversal does not experience a gameplay-blocking freeze.
Do not expand the world.
Do not create another district.
Do not start full-city generation.
Preserve the three existing areas:
1. rural slice
2. River Market
3. eastern workshop shell
Preserve all M5 correctness guarantees
Do not regress:
- stable NPC identities
- persistent simulation state
- environment continuity
- audio lifecycle
- collider safety
- resource disposal
- cancellation
- hysteresis
- bounded loaded-area policy
- deterministic testing
Resource counts after unload/reload must remain stable.
Phase 1 — instrument the transition pipeline more deeply
Add timestamped spans around the complete lifecycle, including:
- request received
- data preparation
- asset lookup/load
- object construction
- scene attachment
- material creation/reuse
- geometry creation/reuse
- collider creation
- NPC creation/tier transition
- audio-emitter setup
- renderer/shadow warmup
- first visible frame
- activation complete
Instrument both JS-owned work and the timing immediately before/after calls that may trigger native browser/GPU work.
Produce a chronological transition report rather than only aggregate totals.
Do not claim native/GPU attribution without evidence.
Phase 2 — eliminate large atomic construction work
The current evidence shows approximately one-second synchronous construction tasks.
Refactor district preparation so expensive construction is staged incrementally rather than performed as one large synchronous operation.
Implement an explicit preparation pipeline such as:
requested → preparing → warming → ready → active
Construction work should be divided into bounded jobs.
Examples may include:
- structures
- static props
- vegetation
- colliders
- NPC proxies
- audio emitters
- render warmup
Do not blindly use arbitrary setTimeout() calls.
Create a deliberate scheduler/work queue with measurable per-frame budgeting.
The scheduler must yield to rendering/input regularly.
Phase 3 — reuse instead of reconstruct where appropriate
Profile which resources are unnecessarily recreated.
Where supported by ownership semantics, reuse/cache:
- immutable geometries
- shared materials
- textures
- building modules
- vegetation assets
- repeated prop assets
Separate:
asset/resource lifetime
from
district instance lifetime.
Unloading a district should not necessarily destroy globally shared immutable assets only to reconstruct them seconds later.
Do not introduce an unbounded cache.
Track ownership/reference counts explicitly.
Phase 4 — preload earlier
Use M5's preload system to begin preparation sufficiently before the player's transition boundary.
The destination should preferably reach ready before the player crosses into it during normal traversal.
Tune preload distance/time using measured player run speed and measured preparation duration rather than arbitrary values.
Avoid loading every neighboring district simultaneously.
Preserve cancellation when the player changes direction.
Phase 5 — renderer warmup
Extend the successful M5 resident-scene shader/pipeline warmup approach to streamed content.
Ensure newly streamed:
- materials
- relevant shadow casters
- renderer pipeline states
are warmed before they become traversal-critical where practical.
Verify that warmup itself is staged and does not become a new giant stall.
Phase 6 — physics preparation
Measure collider/body construction separately.
If physics initialization contributes materially:
- prepare destination collision ahead of handoff
- stage creation if safe
- retain only the collision necessary for safe player traversal during transition
Never allow optimization to create a frame where the player can fall through unloaded geometry.
Workers
Investigate whether any pure-data preparation can safely move to a Web Worker.
Appropriate worker candidates may include:
- procedural layout calculations
- instance transforms
- placement data
- serialization/parsing
Do not move Three.js rendering objects, DOM APIs, WebAudio nodes, or Rapier operations off-thread unless the actual APIs support the chosen architecture.
A Worker is optional and should only be added if profiling shows meaningful benefit.
Performance target
The purpose is to eliminate obvious gameplay freezes, not chase an arbitrary benchmark.
During repeated normal-speed traversal across boundaries:
- no intentional synchronous district-construction task should approach hundreds of milliseconds
- preparation should be distributed across frames
- controls/camera/rendering should remain responsive
Record:
- p50
- p95
- p99
- maximum frame interval
- transition-specific maximum
- largest scheduler job
- preparation duration
- time from preload request to ready
Also record whether destination preparation completed before boundary crossing.
Do not hide stalls by removing district content.
Stress test
Repeat:
rural → River Market → workshop → River Market → rural
for at least several complete circuits.
Test:
- clear/day
- rain/dusk
Verify after repeated cycles:
- renderer resource counts
- physics counts
- JS heap
- NPC identities
- audio emitter counts
- loaded-area state
No monotonic growth or duplication.
Cancellation test
Explicitly test:
1. approach a district and trigger preload
2. turn around before activation
3. ensure obsolete work is cancelled safely
4. approach again
5. ensure the district loads correctly
No leaked resources or corrupted lifecycle state.
Subagents
Use at most two concurrent subagents:
A — transition profiling / native-gap investigation
B — staged construction scheduler / resource reuse
Parent owns lifecycle contracts, integration and stress testing.
No recursive delegation.
Restrictions
Do not:
- expand the map
- add new visual content
- create another district
- generate the city
- simplify accepted M2/M4 content to fake better performance
- add new gameplay systems
- configure Jev
- add paid services
- use image generation
Completion gate
M5.1 is complete only when:
1. the previous ~1 second synchronous construction path has been removed or materially decomposed,
2. destination preparation is staged and measurable,
3. normal traversal remains responsive during preparation,
4. shader/pipeline warmup occurs before traversal-critical activation where practical,
5. repeated streaming cycles retain M5's stable resource/state behavior,
6. cancellation/reversal works,
7. real player traversal tests pass,
8. build/typecheck/browser tests pass,
9. measurements clearly show before/after streaming-tail behavior,
10. any remaining unexplained native stalls are explicitly documented.
Stop at the M5.1 review gate.
Do not begin M6 or full-city generation.