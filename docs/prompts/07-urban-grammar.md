Complete Voxarrium Milestone M7: productionize the approved urban grammar by building two distinct reference-quality districts on the accepted M6.1 city blueprint.
Confirm:
- branch is milestone/m7-urban-grammar
- working tree is clean
- accepted M6.1 is merged
Read:
- AGENTS.md
- STATUS.md
- docs/VISION.md
- docs/ART_DIRECTION.md
- docs/ARCHITECTURE.md
- docs/WORLD_SCALE.md
- docs/ASSET_PIPELINE.md
- docs/PERFORMANCE_BUDGETS.md
- docs/CITY_BLUEPRINT.md
- docs/reference/REVIEWS.md
Use the accepted M6.1 district graph and geometry as authoritative macro layout.
Do not redesign the 14-district topology unless a concrete production contradiction is discovered.
Objective
Build two new production-quality districts that prove Voxarrium’s architectural grammar can create visibly different urban neighborhoods without obvious cloning:
1. central-market
2. lower-canal
Preserve the accepted rural slice and River Market unchanged except for required integration fixes.
Central Market identity
Make Central Market denser and more civic/commercial than River Market.
Target:
- dense street walls
- multi-story merchant buildings
- several shopfront rhythms
- market hall or civic-commercial focal building
- plazas that feel occupied rather than empty
- alleys and service lanes
- signs, awnings and trading props
- higher pedestrian/NPC activity
It must NOT look like River Market copied uphill.
Lower Canal identity
Make Lower Canal a tighter waterfront neighborhood.
Target:
- narrow canal-facing parcels
- quays
- small bridges
- loading/service areas
- workshops mixed with residences
- irregular building footprints
- waterside stairs/platforms
- tighter alleys
- more building/water interaction
It must NOT look like Central Market with blue water added.
Controlled architectural grammar
Turn the accepted building kit into a controlled grammar.
Variation should come from coherent parameters such as:
- footprint
- story count
- story heights
- facade bays
- window grouping
- shutter states
- balconies
- roof family
- roof direction
- corner treatment
- shopfront type
- awnings/signage
- material emphasis
- service attachments
Avoid unrestricted random combinations.
Use district-specific weighted rules so each district develops recognizable character.
Repetition detection
Add development-only diagnostics that help identify:
- identical facade sequences
- repeated neighboring roof combinations
- duplicate building silhouettes
- repeated shopfront patterns
Do not invent a meaningless global “variety score.”
Use diagnostics to find obvious repetition for human review.
Hero buildings
Create one deliberate hero/focal building for each district where composition calls for it.
Hero buildings should be authored more deliberately than ordinary grammar output.
Do not build the M9 citadel assets during M7.
Street-level density
Carry forward M4.1’s urban lessons:
- paving hierarchy
- service props
- drainage/threshold logic
- alley character
- edge occupation
- believable entrances
- market goods
- waterfront service detail
Avoid broad empty paving fields.
Human-scale validation
Validate every major route from:
- third-person
- first-person
- district eagle-eye
Test:
- doors
- alleys
- stairs
- bridge approaches
- quay edges
- camera clearance
- navigation continuity
No screenshot-only geometry.
NPC activity
Reuse the existing persistent NPC system.
Give the two districts different activity patterns.
Central Market should emphasize merchants, customers, civic workers and travelers.
Lower Canal should emphasize residents, porters, craftspeople and waterside workers.
Keep authored dialogue simple.
No live LLM calls.
Environment/audio
Reuse the authoritative:
- time
- weather
- wind
- rain
- audio settings
Give each district appropriate ambient zones without duplicating environment systems.
Streaming/performance
Integrate both districts into the proven M5.1 preparation pipeline.
Re-measure:
- preload request → ready time
- whether destination is ready before boundary-needed/crossing
- p50/p95/p99/max frame interval
- largest preparation job
- cached geometry/material/texture counts
- JS heap
- NPC tier counts
The M6 observation that some preparations completed after boundary-needed remains an explicit risk.
Do not accept either production district if ordinary traversal reintroduces multi-hundred-millisecond transition freezes.
Do not fake better numbers by removing accepted visual content.
Subagents
Use at most two concurrent subagents.
Suggested split:
A — Central Market grammar/content
B — Lower Canal grammar/content
Parent owns shared building grammar, asset contracts, streaming integration, visual consistency, and final review.
No recursive delegation.
Evidence
For EACH new district produce:
- eagle-eye
- primary third-person street
- first-person alley/doorway
- hero/focal building
- day
- night
- rain
Also capture:
- transition from an existing accepted district
- development repetition diagnostics
Compare both districts against River Market and against each other.
Restrictions
Do not:
- generate all remaining districts
- change the accepted city blueprint wholesale
- build final citadel assets
- implement full interiors
- add combat
- add quests
- add multiplayer
- configure Jev
- use remote AI/runtime AI
- use image generation
Completion gate
M7 is complete only when:
1. Central Market passes art review,
2. Lower Canal passes art review,
3. the two districts have visibly distinct identities,
4. obvious building repetition has been reduced to an acceptable level,
5. third- and first-person traversal works,
6. weather/time/audio/NPC systems work in both,
7. streaming preparation remains playable,
8. resource/state lifecycle remains stable,
9. build/tests/browser checks pass,
10. STATUS.md and visual reviews document evidence and remaining risks.
Stop at the M7 human-review gate.
Do not begin M8 automatically.