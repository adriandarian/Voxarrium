# Slice 001 — preliminary analysis

This is a design brief grounded in the supplied images, not a reconstructed measured site.

Master image: monumental elevated castle; dense warm-roof neighborhoods; turquoise water crossing several terraces; bridges and routes tie distinct levels together; farms and vegetation interrupt the urban fabric. Preserve that composition when the city grows.

For the FIRST art slice, use the rural target on the LEFT of experiments/godot-attempt.png: cottage with warm roof and teal-roofed small structure; small organized garden; higher crop terrace; path descending via stairs to water/wooden bridge; vegetation on banks, ledges and near buildings. The whole city master is too small and distant to serve as a literal texture or a source of exact street dimensions.

Unknowns: actual dimensions, unseen facades, bridge clearance, interior layout, camera projection, light intensities and construction detail. Author these coherently at player scale; record decisions in reviews.

Structural gate: relative terraces and water levels, bridge placement, clear traversable paths, believable cottage/door dimensions. Asset gate: roof depth, openings, timber/plaster/stone hierarchy and varied vegetation. Dressing gate: ground transitions, bank vegetation and purposeful props without indiscriminate clutter. Lighting gate: warm sunlight and readable shadow/fill values, without hiding shape errors.

Do not label the initial structural scene final art. Review third-person and first-person continuously, not only at the end.

## M2 authored scale contract (2026-09-28)

The four original PNGs were verified and visually inspected before work. The LEFT rural image, not the adjoining Godot view, guides the slice. Its principal relationships are a cottage below a raised wheat terrace, a teal outbuilding to the cottage's left, enclosed garden to its right, a winding approach entering from the upper left, stairs in front, and a wooden crossing on the lower water level. The master supplies the richer olive/terracotta/turquoise color hierarchy.

`src/simulation/rural-layout.ts` is the shared coordinate contract. The 96 m bounds include surrounding countryside; the focal homestead occupies a smaller central area. Cottage footprint 7.2 × 6.2 m, outbuilding 3 × 2.8 m, garden 9 × 8 m, crop field 18 × 11 m, bridge 3.6 × 14 m. Cottage ground is near 4 m, crop ground 7.4 m, bridge approaches near 0 m. Main routes target 3–5 m width. Dimensions and unseen geometry are design assumptions, not recovered measurements.

The cottage faces runtime +Z. The back and both side elevations must use the same timber/plaster/stone construction, real recessed openings, and a complete roof. A closed external door is appropriate for this slice; an explorable interior is outside scope. Trees and bank plants are solid three-dimensional geometry at inspection range. Natural banks use authored polygon transitions rather than a square terrain tile language. The deterministic M1 world remains selectable with `?scene=m1` for regression testing.
