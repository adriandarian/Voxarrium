# Voxarrium status

## Vercel deployment follow-up (2026-10-04)

The owner authorized remote deployment and automatic updates from merged PRs. The existing Hobby project `adrian-darians-projects/voxarrium` is now linked to GitHub `adriandarian/Voxarrium`, production branch `main`. Vercel reports the merged M8 commit `efee826fb4002c5aacf1af43244edd129a0dd6f1` as `READY` in production at [the live M8 core](https://voxarrium.vercel.app/?scene=m8). The stable domain follows successful `main` builds; other branches receive previews. The bare domain still selects the existing M5 comparison corridor.

Deployment settings are recorded in [DEPLOYMENT](docs/DEPLOYMENT.md) and `vercel.json`: locked install with `npm ci`, Vite build with `npm run build`, output `dist`, and Node.js 22.x for future builds. Package/lockfile engine metadata bounds Node to the tested 22.x line; dependency versions and integrity records are unchanged. The initial remote build predates these source configuration changes. M8 implementation and review status below are preserved.

Deployment preparation passed `npm run build`, `npm run check`, `npm run doctor`, `npm run references:verify`, all 12 `node --test tests/bootstrap.test.mjs` checks, and `git diff --check`. Initial build/typecheck attempts lacked worktree dependencies; installing with `npm ci` resolved them. Vercel's initial remote build and production domain assignment passed. Full simulation/browser suites, hosted gameplay/GPU tests, screenshots and performance measurements were not rerun for this deployment task. The existing large-bundle advisory remains. No paid plan, repository access change or PR merge was performed.

The configuration branch push at `3ebca3e` automatically created preview `dpl_DbLSLTSMYhAEaxsztC7ZXNARZwcJ`, also `READY`. Remote logs confirm Node 22.x, `npm ci`, and a successful matching production bundle. [PR #22](https://github.com/adriandarian/Voxarrium/pull/22) records the source configuration and remains open; automatic Git deployment is already enabled in Vercel.

## Completed M8 and owner authority

M8's objective evidence gate passes on `milestone/m8-city-core`, based on accepted M7 `bc3d635b09388542f97569bdbde167a4364bac6e`. The completed implementation is ready for its local milestone commit. The next authorized action is preparation of M9 on a fresh `milestone/m9-upper-city-skyline` branch from that commit; no M9 implementation is included in M8.

**Owner decision: human art review is intentionally deferred until completion of the current roadmap. Intermediate phases use agentic self-review and objective evidence gates.** Recorded 2026-10-02 from the attached owner objective; see [GOVERNANCE](docs/GOVERNANCE.md) and [M8 prompt](docs/prompts/08-city-core.md). Original submitted M7 status and reviews remain intact. The full intermediate M8 status, including failed and interrupted runs, is preserved in [M8 development history](docs/history/M8_DEVELOPMENT_STATUS.md); see also [M7 history](docs/history/M7_SUBMITTED_STATUS.md).

The owner confirmed releasing capture in the earlier headed test because automation captured their physical mouse while they used the machine. All final automated game and viewer checks were headless. Future automation remains headless unless the owner requests a visible run. External owner CPU/GPU workloads are uncontrolled, and physical display timing is unmeasured.

## Delivered city core

`?scene=m8` connects River Market, Workshop Forecourt, South Gate, Garden Terrace, Central Market, Civic Terrace and Lower Canal. Six wards have production detail; Workshop retains the accepted minimal proxy connector. Rural supplies natural spawn and equivalent return. Six future blueprint wards remain proxies. Exact-data tests preserve all fourteen M6.1 district records, macro roads/water/terrain/connections, accepted courses and original M7 production content.

New Civic/Garden/Gate wards contain 23/32/18 all-side kit buildings and 24/16/18 persistent locals. The six detailed wards contain 223 buildings; population is 152 stable identities. Weighted facade/roof families, supported closed entrances, public/frontage lanes and planted courts preserve district identity. Unseen rear elevations, district uses and entrance/court layouts are authored assumptions. Coarse unloaded silhouettes remain visible; active detail suppresses the corresponding coarse group. Eagle-eye overview images contain mixed detail levels rather than simultaneous full-detail residency. [CITY_CORE](docs/CITY_CORE.md) records inventories and methods.

The M5.1 lifecycle retains cancellation epochs, finite immutable resource caching, collider-before-visibility activation, at most two loaded/pending/retiring detail leases, and timed departure retirement. M8 adds connected bend-aware predictive demand, cost hints, branch/junction/local-return retention and the Canal approach guard. NPC simulation remains plain serializable state with full/reduced/data-only tiers. Weather, time and audio remain global.

Measured preparation uses complete 16 ms soft-budget object-build slices for selected M8 Rural/River/Canal assets; complete shadow submissions remain, with four per queue fence for River/Canal. A scoped current-instance-buffer name preserves actual array/layout/bindings. The renderer-local 512-entry immutable pipeline cache selects only Rural/River, releases owned leases on disposal and does not retain area meshes/colliders. These pinned r186 compatibility adapters require revalidation on upgrades; unit native work is stubbed and is not GPU execution evidence. See [ARCHITECTURE](docs/ARCHITECTURE.md) and [SOURCES](docs/SOURCES.md).

## Final source and validation

Runtime fingerprint: `64633718027bc9b3982d5450df46ad036d7b20a8f4da10e141bb4732e55182cd`. Final timing, browser captures, production smoke, supplemental views and moving clips carry this fingerprint. Capture tools have separate recorded hashes because tools/docs/tests are outside the runtime fingerprint. Dependencies and lockfile remain pinned without version changes.

| Check | Actual final result |
| --- | --- |
| `npm test` | 166 simulation tests and 12 bootstrap checks PASS; zero skips, failures or flaky cases. Simulation duration 14.8 minutes. |
| `npm run test:browser` | All 41 cases PASS in 48.4 minutes; zero skips, failures or flaky cases. Native and explicit WebGL2 core routes plus prior-scene controller/environment/audio/streaming regressions pass. |
| `npm run check` | Repository checks and TypeScript PASS; rerun after the final viewer/tool documentation changes. |
| `npm run doctor` / `npm run references:verify` | PASS; all four original source-image hashes retained. Doctor is tool/reference validation, not gameplay/GPU proof. |
| `npm run build` | PASS: 5,627.07 kB / 2,053.95 kB gzip; existing large-chunk advisory remains. |
| Native whole-core cadence | Three clear/day and three rain/dusk actual-input circuits PASS, third-/first-/third-person in each preset; zero resets, drops, browser/streaming failures or late releases. |
| Built production smoke | Initialized WebGPU PASS; actual W/V/Esc movement (3.03 m), camera switch, pause/resume and rain/night settings, 152 locals, no development harness/debug controls or browser errors. |
| Visual evidence/viewer | 20 native browser views, two supplemental first-person views and four approximately 12-second moving clips PASS. Standalone gallery loads 26 images including four historical references, decodes/seeks/plays all four videos and passes timeline/preset/play/reset checks. Actual sample frames were inspected. |

Native cadence uses headless Chrome 154.0.8037.93, initialized AMD/RDNA2 WebGPU, 1920×1080 and DPR 1. Each complete natural circuit follows the whole connected core with W/Shift input, without in-sample teleport/bookmark/step/reset/reload or added junction waits. Complete frame intervals and ordered request chronology are retained; exact bounded chronology transfers occur during ordinary movement and before sample end.

| Preset / camera | Samples | p50 / p95 / p99 (ms) | Full maximum (ms) | Transition maximum (ms) | Largest complete job (ms) |
| --- | ---: | --- | ---: | ---: | ---: |
| Clear/day / third | 77,411 | 7.0 / 19.2 / 27.8 | 125.4 | 125.4 | 31.1 |
| Clear/day / first | 78,856 | 7.0 / 19.4 / 29.4 | 125.4 | 125.4 | 29.9 |
| Clear/day / third | 60,957 | 7.1 / 27.6 / 39.8 | 180.6 | 180.6 | 54.5 |
| Rain/dusk / third | 77,937 | 7.0 / 14.1 / 25.1 | 159.7 | 119.4 | 23.3 |
| Rain/dusk / first | 71,760 | 7.0 / 20.8 / 27.8 | 132.0 | 132.0 | 32.2 |
| Rain/dusk / third | 70,566 | 7.0 / 20.8 / 27.8 | 132.0 | 132.0 | 23.8 |

All six full and transition maxima are below the unchanged 200 ms gate. Every circuit activates all seven wards and has fourteen observed preparations ready before both safety approach and exact crossing, zero late and twenty-one unobserved request windows. Preparation slices are soft budgets; the 54.5 ms complete-job maximum remains disclosed. Whole preset durations are 2,109.080 seconds clear/day and 2,101.116 seconds rain/dusk.

Equivalent Rural returns restore matching render/asset/cache/collider/NPC/audio ownership within each preset: 317 clear or 318 rainy geometries, 19 textures, 68 visible materials, immutable cache 79/192, native cache 158 entries/183 programs with misses fixed at 158 and zero evictions/pending, 787 colliders/one body, 152 unique NPCs with tiers 6/0/146, and one native audio context/five loops. All fifteen selected heap constructor/native-wrapper counts and shallow sizes match exactly across the three returns in each preset.

**Total JavaScript heap is not flat.** Retained clear heap is 100,952,620 / 102,166,828 / 103,835,780 bytes (+2,883,160); rain is 101,044,856 / 101,135,748 / 103,157,784 (+2,112,928). Graph shallow-size growth is 1,858,923 clear and 1,638,857 rainy bytes; approximately 89.6% / 90.0% lies in V8's code category. This reports observed allocation categories and scoped owned-resource stability, without causal JIT attribution, arbitrary leak freedom, retained paths, GPU execution time or VRAM. [Performance notes](docs/PERFORMANCE_BUDGETS.md) preserve the complete method and limitations.

## Evidence, review and preserved failures

The local [review gallery](artifacts/m8/review.html) combines both complete three-circuit observation replays, current images/videos and master/rural/M4/M7 references. Its map uses labeled interpolation of actual recorded observations; it is not a continuous game video. Moving clips and explicit inspection setups remain separate from cadence. The agent opened all 20 final browser PNGs, both supplemental first-person PNGs, eight saved 4/8-second moving PNGs, four native decoded eight-second frames, four playback frames and the viewer screenshot. Native video playback was verified; frame-by-frame viewing of entire clips is not claimed.

The appended [final art audit](docs/reference/REVIEWS.md) records three remaining differences: dominant hero skyline; denser inhabited terrace edges and less repetitive frontage; richer bridge/gate/waterfront structure. Civic/Garden/Gate identity and playable streets are present, while broad shoulders, plain retaining faces, domestic kit rhythms, upper-city proxies and placeholder figures remain visible. These are M9/later art priorities, without numerical similarity scores or owner acceptance.

Current evidence is under `artifacts/m8/`: `browser/`, `alley-review/`, `waterfront-review/`, `motion-final/`, `production-canal-final64/`, `viewer-check/`, `stress/clear-day-canal-final64-20261004/`, `stress/rain-dusk-canal-instance-buffer-names/` and `checks/`. The six-circuit audit is `checks/six-circuit-final64.json`; full suite reports are `checks/simulation-canal-final64.json` and `checks/browser-canal-final64-bounded-export.json`. Artifacts remain local and ignored by Git; source, tools and factual documentation are committed.

Earlier readiness/cadence failures, owner-interrupted headed work, the interrupted first current clear run, focused-probe setup assertion failure, browser manifest-export failure and viewer failures remain separately preserved. The first current browser attempt records both a 20-minute timeout and `RangeError: Invalid string length`; corrected view metadata omits duplicated tail ledgers before transfer, retaining complete route reports and the unchanged timeout. The final full suite passes. The standalone viewer fix preserves fractional playback progress instead of losing it to one-second slider rounding; its preceding failed HTML/logs remain. None of these historical attempts is substituted for current six-circuit evidence.

No unresolved M8 correctness or architecture blocker remains. Lower-end hardware, production/WebGL2 cadence comparisons, physical display timing, GPU timestamps, VRAM, arbitrary retained-path leak analysis and hosted CI are unmeasured. Work was serial; no subagents, paid services, dependency/provider/global changes, remote deployment, push, PR or merge were initiated. Human art review remains intentionally deferred. M9 preparation follows the completed local M8 commit and carries these factual limits forward.
