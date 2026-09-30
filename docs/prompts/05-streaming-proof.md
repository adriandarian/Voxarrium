Complete Voxarrium Milestone M5: investigate the rare long-frame stalls and prove reliable multi-district streaming without beginning full-city generation.
Confirm:
- current branch is milestone/m5-streaming-proof
- working tree is clean
- accepted M4.1 has been merged
Read:
- AGENTS.md
- STATUS.md
- docs/ARCHITECTURE.md
- docs/PERFORMANCE_BUDGETS.md
- docs/TESTING.md
- relevant M4/M5 prompt documentation
M5 has two ordered phases
Do not start Phase B until Phase A has produced useful evidence.
Phase A — investigate rare 0.8–1.0 second stalls
Reproduce the existing River Market traversal under controlled conditions.
Instrument enough of the runtime to distinguish, where practical:
- JavaScript task duration
- GC
- asset loading
- texture upload
- shader/pipeline compilation
- chunk/world initialization
- audio decode/startup
- renderer submission/presentation timing signals available from the browser
- tab/browser/OS scheduling gaps
Do not claim GPU execution timing unless actual GPU timestamp support is used.
Correlate long rAF gaps with timestamped subsystem events.
Run several comparable traversals.
If a concrete cause is found, fix only that demonstrated bottleneck and remeasure.
If the cause remains external/unknown after reasonable investigation, document what has been ruled out and continue without speculative architectural rewrites.
Phase B — bounded streaming proof
Build a small streaming test involving exactly three world areas:
1. accepted rural slice
2. accepted River Market district
3. one lightweight neighboring district shell sufficient to test transitions
The third area is a streaming test environment, not a polished M6 district.
Do not generate the full city.
Streaming architecture requirements
Define explicit ownership for:
- district/chunk lifecycle
- render resources
- physics bodies/colliders
- NPC simulation state
- audio emitters
- environmental hooks
- asset references
Implement:
- preload radius / transition preparation
- load
- activate
- deactivate
- unload
- cancellation for obsolete async loads
- resource disposal/reference counting
- hysteresis so boundaries do not thrash
Keep player collision and destination transition geometry safe during handoff.
No visible loading screen should be required for normal movement between these three test areas.
Persistent world identities
NPCs and persistent interactables must have stable IDs independent of render objects.
Test:
- leave district
- unload it
- return
- NPC/state remains logically consistent
Do not duplicate NPCs or reset schedules unexpectedly on reload.
Simulation state must remain separate from Three.js scene objects.
NPC simulation tiers
Implement or validate simple tiers:
- nearby/full
- loaded-district/reduced update
- unloaded/data-only
Do not simulate animation/navigation for unloaded NPCs.
Preserve authored schedules.
Environment continuity
The authoritative M3 environment state must remain continuous across district boundaries:
- time
- weather
- wind
- rain
- audio category settings
Crossing a streaming boundary must not reset weather or lighting.
Audio lifecycle
Verify district ambient emitters:
- activate when appropriate
- fade or disable when leaving
- dispose/reuse correctly
- do not multiply after repeated load/unload cycles
Stress test
Repeatedly traverse:
rural → River Market → test district → River Market → rural
for multiple cycles.
Check for:
- increasing JS heap
- increasing renderer geometry/material/texture counts
- duplicate NPCs
- duplicate audio
- stale physics colliders
- navigation failures
- frame spikes at boundaries
Record before/after resource counts.
Performance measurements
Record:
- initialized renderer backend
- viewport / DPR
- p50 / p95 / p99 frame intervals
- maximum interval
- resource counts
- active NPC counts by tier
- loaded districts/chunks
- JS heap when available
- loading/unloading duration
Keep the known bundle-size advisory tracked but do not derail M5 into bundle optimization unless it demonstrably affects streaming.
Subagents
Use at most two concurrent subagents:
A — performance-tail instrumentation/investigation
B — streaming/resource-lifecycle implementation
Parent owns lifecycle interfaces, integration and final stress testing.
No recursive delegation.
Do not implement
Do not:
- generate the complete city
- produce hundreds of buildings
- add new gameplay systems
- add combat
- add quests
- add multiplayer
- add Jev
- add remote AI/services
- use image generation
M5 completion gate
M5 is complete only when:
1. the long-frame issue has been investigated with stronger evidence and either attributed/fixed or explicitly bounded as unresolved,
2. three connected world areas can load/unload during real traversal,
3. repeated boundary crossing does not leak or duplicate resources,
4. player collision remains safe through transitions,
5. NPC state survives unload/reload,
6. environment/weather remains continuous,
7. audio lifecycle remains correct,
8. stress-test resource counts remain stable,
9. browser/build/tests pass,
10. factual performance measurements and limitations are recorded in STATUS.md.
Stop at the M5 review gate.
Do not begin full-city generation automatically.