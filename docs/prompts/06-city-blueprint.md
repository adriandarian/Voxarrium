Complete Voxarrium Milestone M6: derive and implement the walkable macro-blueprint of the full city from the master reference image without filling the city with production buildings yet.
Confirm:
- current branch is milestone/m6-city-blueprint
- working tree is clean
- accepted M5.1 has been merged
Read:
- AGENTS.md
- STATUS.md
- docs/VISION.md
- docs/ART_DIRECTION.md
- docs/ARCHITECTURE.md
- docs/WORLD_SCALE.md
- docs/PERFORMANCE_BUDGETS.md
- docs/reference/REVIEWS.md
- the master reference image at docs/reference/city-master.png
M6 objective
Convert the master eagle-eye artwork into a coherent city-scale spatial blueprint that:
1. resembles the reference composition from the canonical eagle-eye camera,
2. is fully plausible at human scale,
3. can be divided into streamable districts,
4. preserves waterways, bridges, terraces and landmark hierarchy,
5. provides a foundation for later production-quality district generation.
Do NOT attempt to fully populate the city with final buildings.
This milestone is about:
- topology
- terrain
- waterways
- district footprints
- primary/secondary roads
- bridge connections
- landmark positions
- streaming graph
Phase 1 — analyze the master image
Use the actual city-master.png.
Produce a documented interpretation of:
- major elevation tiers
- waterway directions
- bridge locations/types
- major plazas
- castle/citadel plateau
- dense central neighborhoods
- lower river districts
- outer residential zones
- farms/gardens/outskirts
- major landmark silhouettes
- likely major circulation routes
Distinguish clearly between:
visible evidence
and
necessary design assumptions.
Do not claim exact dimensions from pixels.
Phase 2 — define the city district graph
Create a city graph containing roughly 10–16 meaningful districts rather than hundreds of arbitrary chunks.
Candidate district roles may include:
- rural outskirts
- River Market
- workshop/craft district
- lower canal district
- residential district
- garden district
- central market
- civic district
- noble quarter
- temple/academic quarter
- upper city
- castle/citadel
Adjust names and boundaries to fit the actual reference analysis.
Each district needs:
- stable ID
- role
- elevation band
- neighbors
- primary entrances/exits
- water adjacency
- landmark(s)
- approximate footprint
- streaming priority
- expected density class
Existing accepted areas must map cleanly into this graph rather than being discarded.
Phase 3 — terrain and elevation skeleton
Create the city-scale terrain/terrace blockout.
Focus on:
- strong elevation hierarchy
- castle high point
- river/canal valleys
- terraced neighborhoods
- believable slopes/stairs/ramps
- farmland transition at edges
Avoid a flat city with buildings sitting on one plane.
Do not produce final cliffs/materials.
Use simple graybox/stylized blockout geometry where appropriate.
Phase 4 — waterway network
Reproduce the reference's essential water structure:
- main river/canal flow
- branches where supported by reference
- crossings
- embankments
- bridge locations
Water must make sense topologically.
Avoid decorative waterways that cannot connect coherently.
Existing River Market and rural water must connect naturally into the city network.
Phase 5 — circulation network
Define:
- major roads
- secondary streets
- alleys
- stair connections
- bridge crossings
- plaza connections
The major circulation network should be understandable from eagle-eye view.
At street level it must support:
- third-person camera space
- first-person traversal
- believable door access
- NPC movement
Avoid:
- perfect grids
- procedural spaghetti
- impossible cliffs
- decorative inaccessible roads
- excessive dead ends
Phase 6 — landmark blockout
Create simple massing proxies for major landmarks only.
Examples:
- castle/citadel
- major civic building
- temple/tower
- central market landmark
- gatehouse
- significant bridges
These should establish skyline and orientation.
They are NOT final Blender assets.
Preserve the castle/citadel as the dominant visual anchor from many districts.
Phase 7 — representative building massing
Populate only enough low-detail building masses to evaluate:
- density
- skyline
- street-wall rhythm
- district differentiation
Do NOT generate production-quality hundreds of buildings.
Use cheap proxy/massing geometry.
The purpose is to answer:
Does the city composition resemble the master artwork?
not:
Are the buildings finished?
Phase 8 — integrate streaming topology
Map the district graph onto the proven M5.1 lifecycle.
Do not activate the entire city simultaneously.
Define:
- district adjacency
- preload neighbors
- likely player transition paths
- maximum residency assumptions
Use lightweight proxies where necessary.
Do not weaken the existing two-area streaming proof without measurement.
Existing accepted content
Preserve and position:
- accepted rural slice
- River Market
- workshop test area where useful
Do not remodel them merely to make the blueprint easier.
They should become anchored pieces of the larger city.
Canonical city camera
Establish a deterministic eagle-eye master camera designed to evaluate city-scale composition against city-master.png.
It does not need to replicate the concept camera mathematically if projection is uncertain.
It must provide a consistent repeatable comparison.
Also add several district-level debug cameras.
City visualization/debugging
Add optional debug visualization for:
- district boundaries
- district IDs
- roads
- waterways
- bridge graph
- elevation bands
- streaming adjacency
Keep it development-only.
Performance
The complete blueprint should use cheap massing/proxies.
Do not measure production-city performance from proxy geometry as though it predicts final performance.
Do verify:
- world-coordinate stability
- camera precision
- streaming topology
- traversal between representative connected districts
Track M5.1 streaming-tail metrics and do not regress the scheduler architecture.
Subagents
Use at most two concurrent subagents.
Recommended:
A — reference analysis / terrain / water / district graph
B — circulation / landmark massing / runtime visualization
Parent owns:
- final city topology
- integration with existing areas
- scale
- streaming contracts
- comparison captures
- STATUS.md
No recursive delegation.
Evidence
Produce:
- master eagle-eye city blueprint capture
- labeled district-map/debug capture
- castle-to-lower-city composition
- waterway network capture
- at least three representative third-person street/blockout views
- traversal between at least several adjacent blueprint districts
Compare the master eagle-eye against the original artwork qualitatively.
Record the three largest macro-composition differences.
Restrictions
Do NOT:
- create final assets for every district
- generate hundreds/thousands of detailed buildings
- create final interiors
- add combat
- add quests
- add multiplayer
- use remote AI at runtime
- configure Jev
- use image generation
- expand NPC simulation to the entire city
M6 is a blueprint, not city production.
Completion gate
M6 is complete only when:
1. a documented district graph exists,
2. the main elevation hierarchy is represented,
3. the waterway network is coherent,
4. major roads/bridges connect districts,
5. major landmarks establish a recognizable skyline,
6. accepted existing areas fit naturally into the city,
7. a canonical eagle-eye capture can be compared against the master reference,
8. representative human-scale traversal works,
9. streaming topology is mapped onto the proven M5.1 architecture,
10. tests/build/browser checks pass,
11. STATUS.md records assumptions and remaining macro-layout differences.
Stop at the M6 human-review gate.
Do not begin full production city generation automatically.