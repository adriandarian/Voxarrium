**Complete Voxarrium Milestone M3: make the approved rural slice feel alive while preserving its accepted art direction and playability.**

First confirm:

- current branch is `milestone/m3-living-slice`
- working tree is clean
- M2 has been accepted and merged

Read:

- `AGENTS.md`
- `STATUS.md`
- `docs/VISION.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/prompts/03-living-slice.md`
- `docs/reference/REVIEWS.md`

Use the accepted M2 rural slice as the fixed world area.

Do not expand the map.\
Do not begin the full city.\
Do not redesign the cottage, bridge, terrain composition, or vegetation language except for minimal bug fixes.

## M3 objective

Make the existing slice feel alive through environment state, motion, simple NPC behavior, and audio, while preserving M2’s visual and traversal quality.

---

## Environment state

Implement one authoritative environment state driving:

- time of day within bounded presets or states as appropriate
- sunlight direction/intensity
- ambient fill changes
- wind strength
- cloudiness
- rain on/off or clear/cloudy/rain transitions

Keep scope small and robust.

At minimum support:

- clear
- cloudy
- rain

and multiple representative lighting states such as:

- day
- late afternoon / dusk
- night or night-like low-light state if appropriate

Do not add heavy volumetrics, expensive weather simulation, or cinematic post-processing.

---

## Environmental motion

Add subtle motion to the world where appropriate:

- tree/foliage wind response
- grass motion
- water surface response
- rain visuals if raining

Motion should support the accepted art style and remain performant.

Do not introduce visual noise that destroys the scene readability.

---

## NPCs

Add a small local population for the slice, approximately 4–8 NPCs.

Requirements:

- stable identities
- simple authored names or labels
- authored local dialogue or interaction text
- deterministic schedule or route behavior
- believable patrol/walk/idle routines
- simple shelter-seeking behavior during rain

Nearby NPCs may use richer updates; distant NPCs may use reduced updates.

Do not use live LLM inference or remote services.

Do not implement full quest or economy systems.

---

## Interaction

Support simple interaction with NPCs and a few local props if appropriate.

This can include:

- interact prompt
- short authored text bubble, panel, or dialogue UI
- simple environmental labels

Keep UI lightweight and local.

No elaborate dialogue trees are required in M3.

---

## Audio

Add lightweight spatial/ambient audio support after a user gesture.

Include categories such as:

- wind
- water / river ambience
- footsteps by surface
- light NPC ambience or local cues
- rain ambience when raining

Add master/category volume control if practical within the existing settings/UI approach.

Keep scope measured and reliable.

No external audio service integration.

---

## Cameras and traversal

Preserve:

- third-person as primary
- first-person option on the same player
- deterministic eagle-eye review capture
- current collision/traversal reliability

Re-test:

- walking/running/jumping
- camera switching
- pause/resume
- rain state if applicable
- interaction with NPCs

---

## Testing and evidence

Run the relevant suite after implementation.

Capture evidence for:

- eagle-eye
- third-person
- first-person
- one or more environment states
- at least one rain view if implemented
- at least one NPC interaction view

Record:

- actual initialized renderer/backend
- browser
- viewport/DPR
- performance baseline
- any measured performance changes from M2

Update:

- `STATUS.md`
- `docs/reference/REVIEWS.md` where relevant

---

## Restrictions

Do not:

- expand to new map areas
- start the city
- redesign the whole art slice
- add quests/economy/combat
- add multiplayer
- add Jev or paid APIs/services
- use image generation

Keep scope centered on “make the approved slice alive.”

---

## M3 completion gate

M3 is complete only when:

1. the rural slice remains visually intact and traversable,
2. environment states visibly work,
3. subtle environmental animation is present,
4. NPCs exist and behave in simple believable ways,
5. at least basic interaction/dialogue works,
6. spatial/ambient audio works after user gesture,
7. build/tests/browser checks pass,
8. captures and factual measurements are produced,
9. STATUS.md records results and limitations,
10. the goal stops at the M3 review gate.

Do not begin M4 automatically.