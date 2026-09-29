# Testing and visual review

## Bootstrap checks (implemented)
Run `npm ci` from the committed bootstrap lockfile. `npm test`: Node tests for reference verification, corruption/missing-file behavior, and repository-contract checks. `npm run check`: expected documentation/configuration files and manifest sanity. `npm run doctor`: local Node/Git/Blender diagnostics. `npm run references:verify`: strict signatures, byte counts, hashes and dimensions for all four committed originals. CI uses the same strict command; missing or corrupt originals fail. `npm run blender:fixture`: isolated local calibration export and GLB header validation; runtime scale, axes and materials require the M1 runtime.

## M1 checks (not implemented yet)
Add real typecheck/build commands and Playwright tests after installing and locking the runtime. Browser launch success is not visual validation. Capture console/page errors, backend, fixed seed and viewport, loaded-asset readiness and supported renderer stats. Wait for actual readiness/shader compilation, not an arbitrary sleep alone.

Create eagle-eye, third-person and first-person camera bookmarks for the same scene. Freeze simulation/time/weather for reference shots, but also record a moving traversal clip to catch temporal/LOD/camera defects. Player controls, stairs, slopes, doorways, bridge edges, camera obstruction, pause/resume and mode switching need behavioral tests.

## M2 art gate
Compare the master at macro scale and the rural target portion of the Godot comparison at slice scale. Do not treat the earlier 3D attempts as desired output. Review composition/silhouettes, scale, surface language, focal hierarchy, vegetation grouping, water banks and repetition. Use side-by-side/crops only when the camera and scope align. An image diff detects regression to an approved runtime baseline; it does not measure artistic equivalence to the concept image.

Store screenshots/reports under ignored `artifacts/`; retain chosen baselines deliberately. Write findings in `docs/reference/REVIEWS.md`. Human approval is required before city expansion. No fabricated test results or quality scores.
