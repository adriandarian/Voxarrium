Complete Voxarrium M2.1: converge the existing rural slice toward the supplied reference artwork.
This is an ART POLISH milestone.
Do not expand the map.
Do not add gameplay systems.
Do not add NPCs, weather, time-of-day systems, audio, interiors, city generation, quests or image generation.
The current M2 implementation is technically accepted.
Preserve:
- current player/controller
- third-person/first-person cameras
- physics
- current renderer
- capture system
- general terrace composition
- cottage geometry unless a concrete defect requires modification
- bridge functionality
- current test coverage
The human art review identified the following priority order:
1. Remove obvious tree and shrub repetition
Current vegetation is too dominated by repeated round/cauliflower silhouettes.
Create multiple fundamentally different tree families, not merely scaled variants of one tree.
Vary:
- trunk structure
- branching
- crown topology
- crown width
- crown height
- asymmetry
- leaf-cluster size
- local color
Preserve instancing where practical.
Also diversify shrubs so they do not all read as the same rounded mound.
2. Increase environmental visual frequency without random clutter
The target contains far less uninterrupted clean lawn.
Add layered ecological ground detail:
- grass variation
- weeds
- low plants
- flowers
- small stones
- exposed earth
- moss
- roots where appropriate
- restrained natural debris
Distribution must remain clustered and context-aware.
Do not uniformly scatter noise everywhere.
Preserve traversal paths and focal areas.
3. Rework paths
Current paths look too clean, smooth and spline-generated.
Introduce:
- low-frequency boundary irregularity
- subtle width variation
- grass encroachment
- small embedded stones
- soil/value variation
- local wear
Paths should look naturally used while remaining unmistakably navigable.
4. Rework terrace/cliff transitions
Current cliffs read as repeated large rock modules.
Retain useful existing rocks but integrate them into a layered terrain treatment.
Desired transitions include:
grass lip → weeds/moss → soil → exposed rock → crevice vegetation → lower terrain.
Add smaller secondary rock shapes and irregular edge transitions.
Avoid universal rectangular cliff walls.
5. Replace the current stair visual treatment
The current stairs resemble modern concrete stairs.
Create aged stylized stone steps integrated into the landscape.
Use:
- slightly irregular visual stone dimensions
- worn edges
- moss/grass intrusion
- stronger terrain integration
Retain simple reliable invisible collision geometry if necessary.
Gameplay reliability takes precedence over matching visual collision exactly.
6. Improve river and bank integration
The river currently reads as a broad, relatively empty turquoise strip.
Improve:
- shoreline irregularity
- shallow edge treatment
- reeds and bank plants
- stones
- bank shadows
- slight depth/color variation
- bridge-to-bank transition
Review whether the river and bridge are perceptually oversized relative to the reference slice and adjust only if traversal remains comfortable.
Do not implement expensive physical water simulation.
7. Improve cottage material richness
Keep the current cottage geometry unless needed.
First-person inspection currently exposes materials that are too clean/uniform.
Add restrained stylized variation to:
- plaster
- structural timber
- doors
- roof tiles
- stone foundation
Include subtle dirt/moss/contact variation near the ground.
Avoid photorealistic grunge and high-frequency texture noise.
Maintain the stylized reference language.
8. Improve macro ground variation
The underlying grass surface is too uniform.
Add broad subtle material/color variation based on environmental context such as:
- water proximity
- path proximity
- structure proximity
- cliff edges
- tree areas
This should enrich large surfaces underneath vegetation rather than replace vegetation.
9. Lighting pass only after geometry/material improvements
Once the above changes are visible, tune:
- warm directional sunlight
- softer readable ambient fill
- contact depth
- green saturation/value balance
- water/roof/stone relationships
Do not introduce bloom, depth-of-field, fog or aggressive grading as shortcuts.
Use at most two subagents.
Recommended:
A — vegetation + terrain ecology
B — paths/cliffs/stairs/water/material polish
Parent retains visual integration and final reference comparison.
After each major iteration:
1. capture the same deterministic eagle-eye view,
2. compare directly with the supplied rural target,
3. identify the three largest remaining mismatches,
4. address those before minor polishing.
Also inspect third-person and first-person views.
Preserve performance diagnostics and run the complete relevant test/build/browser suite before finishing.
Do not report an arbitrary visual-similarity percentage.
Update docs/reference/REVIEWS.md with concrete before/after observations.
M2.1 is complete only when:
- tree repetition is no longer immediately obvious,
- major grass areas no longer read as empty uniform lawns,
- paths visibly feel organic,
- stairs belong to the environment,
- cliffs have layered terrain transitions,
- river banks are visually integrated,
- cottage surfaces survive first-person inspection significantly better,
- eagle-eye composition remains intact,
- third-person and first-person traversal remain reliable,
- tests/build/browser checks pass,
- new comparison captures are available for human review.
Stop at the human art-review gate.
Do not start M3.