Complete Voxarrium Milestone M4: build the first dense, fully traversable urban district at the established M2/M3 quality bar.
Confirm:
- branch is milestone/m4-first-district
- working tree is clean
- M3 has been accepted and merged
Read:
- AGENTS.md
- STATUS.md
- docs/VISION.md
- docs/ART_DIRECTION.md
- docs/ARCHITECTURE.md
- docs/WORLD_SCALE.md
- docs/ASSET_PIPELINE.md
- docs/PERFORMANCE_BUDGETS.md
- docs/reference/REVIEWS.md
- docs/prompts/04-district-and-streaming.md
M4 objective
Create one bounded urban district that proves Voxarrium can scale from the accepted rural slice into dense city fabric without losing:
- visual richness
- human-scale traversal
- building variety
- NPC believability
- weather/time support
- performance
This is NOT the full city.
Do not implement kilometer-scale world generation yet.
District scope
Build approximately:
- 20–40 buildings
- 3–5 interconnected streets and alleys
- one small plaza/market
- one canal/river edge
- one or two bridges
- one hero landmark such as a tower, guild hall, gatehouse, chapel, or civic building
- several elevation changes where appropriate
The district should connect visually and physically to the existing rural edge.
Critical quality rule
The district must be evaluated from:
- eagle-eye
- third-person
- first-person
Do not optimize exclusively for the aerial reference.
Buildings must have believable backs, sides, entrances, alleys, foundations, roof edges, and street relationships.
Modular architecture
Create a small, high-quality reusable architectural kit rather than manually modeling every building.
Start with a limited number of strong modules:
- plaster/timber wall sections
- stone bases
- roof types
- roof corners/end caps
- windows
- doors
- chimneys
- balconies
- awnings
- signs
- stairs
- railings
- market elements
Use the accepted cottage as one style anchor.
Generate variation through composition, proportions, floor count, roof shape, facade rhythm, color and attachments.
Avoid obvious random-part soup.
Hero buildings remain bespoke.
Building variety
Create several coherent archetypes, for example:
- modest residential
- merchant/shop
- workshop
- townhouse
- canal-side building
- civic/wealthier building
Buildings should vary meaningfully in:
- width
- height
- roofline
- facade rhythm
- footprint
- orientation
- material emphasis
Detect and reduce obvious repetition.
Street design
Streets must feel deliberately authored.
Include:
- primary street
- secondary lanes
- narrow alleys
- small widening/plaza spaces
- stairs or slope transitions where useful
- canal/bridge approaches
Avoid:
- perfect grids
- endless straight roads
- uniform widths
- inaccessible decorative doors
- camera-hostile alleys
Test third-person camera collision throughout.
Interiors
Do NOT make every building fully enterable.
Support:
- believable doors
- selective accessible interiors for one or two important buildings if useful
- future interior hooks
Do not derail M4 into interior production.
NPC scaling
Expand from six rural NPCs to a district population sufficient to feel inhabited.
Target roughly:
- 30–60 nearby/local simulated NPCs depending on measured performance
Use simulation tiers where useful.
Include:
- residents
- merchants
- workers
- travelers
- guards or civic workers where appropriate
Keep dialogue authored and local.
Do not use remote LLM calls.
Avoid obvious synchronized route loops.
Market / plaza activity
Give the plaza a functional reason to exist:
- stalls
- merchant positions
- meeting points
- props
- NPC activity
Keep it readable and navigable.
Environmental systems
Preserve and extend the M3 systems:
- day/dusk/night
- clear/cloudy/rain
- wind
- spatial audio
- NPC shelter behavior
The new district should respond to the same authoritative environment state.
Do not create separate duplicate weather systems.
Lighting
Start adding local lights where appropriate:
- lanterns
- windows
- market/shop lights
At night, the district should remain readable and visually interesting.
Keep light counts measured.
Do not flood the district with dynamic shadow-casting lights.
Audio
Add district-specific ambience:
- market murmur
- footsteps
- water/canal
- doors
- workshop sounds where appropriate
- nighttime reduction
Preserve category volume controls.
Avoid an indiscriminate wall of sound.
Performance
This milestone must begin measuring scaling behavior.
Record:
- FPS/frame interval stats
- draw calls
- triangles
- visible objects
- active NPCs
- instanced counts
- JS heap where practical
- loaded asset counts
Investigate the previously observed rare long frames with a browser performance trace if they recur.
Do not optimize blindly.
Fix only demonstrated bottlenecks.
Subagents
Use at most two concurrent subagents.
Recommended:
A — urban layout + navigation + runtime integration
B — modular architecture + Blender asset production
Parent owns:
- shared contracts
- art direction
- district composition
- integration
- performance review
- final captures
- STATUS.md
M4 evidence
Produce:
- eagle-eye district capture
- third-person primary street
- first-person alley/doorway
- market/plaza
- canal/bridge
- dusk/night
- rain
Also provide a traversal route through the entire district.
Do not implement
Do not:
- build the whole city
- generate thousands of buildings
- add multiplayer
- add combat
- add procedural quests
- add remote AI services
- configure Jev
- use image generation
- start kilometer-scale streaming unless a small measured experiment is specifically required
M4 completion gate
M4 is complete only when:
1. a dense urban district exists,
2. building repetition is not immediately distracting,
3. street-level navigation works,
4. eagle-eye composition looks intentional,
5. first-person views hold up,
6. NPC activity makes the district feel inhabited,
7. weather/time/audio systems function across the district,
8. performance is measured honestly,
9. rare frame spikes are investigated if reproducible,
10. build/tests/browser checks pass,
11. review captures exist,
12. STATUS.md records factual results and remaining risks.
Stop at the M4 human-review gate.
Do not begin full-city generation or M5 automatically.