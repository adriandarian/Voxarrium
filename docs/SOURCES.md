# Primary documentation checked for this bootstrap

Reviewed 2026-09-28. Validate installed versions locally. These are upstream capability references, not evidence that Voxarrium has implemented them.

- Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md/
- Codex configuration reference: https://developers.openai.com/codex/config-reference/
- Codex subagents: https://developers.openai.com/codex/subagents/
- Codex repository skills: https://developers.openai.com/codex/skills/
- Three.js WebGPURenderer guide: https://threejs.org/manual/pages/webgpurenderer
- Three.js WebGPURenderer API: https://threejs.org/docs/pages/WebGPURenderer.html
- Vite requirements: https://vite.dev/guide/
- Blender GLB/glTF export API: https://docs.blender.org/api/main/bpy.ops.export_scene.html
- Blender command line: https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html

Current Codex configuration documents max_threads as a legacy alias for the concurrent child-thread limit. The repository uses that small compatibility setting only; model and provider choices inherit the owner's app settings. Verify support in the installed app. No speculative model ID, full-access setting, provider key, or automatic API spend is configured.

## M1 sources checked 2026-09-28

- [Three.js WebGPURenderer API](https://threejs.org/docs/pages/WebGPURenderer.html): native WebGPU preference, WebGL2 fallback and explicit forceWebGL. Installed r186 backend flags/device/context and cleanup implementation were also inspected.
- [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/): kinematic translation, offset, slope thresholds, autostep, snap and contact queries. Actual installed 0.21 declarations were used.
- [Rapier JavaScript setup](https://rapier.rs/docs/user_guides/javascript/getting_started_js/): async WASM initialization and package integration.
- [Vite guide](https://vite.dev/guide/): vanilla runtime, Node support, dev/build/preview. Installed 8.3.1 accepts Node 20.19+ or 22.12+.
- [TypeScript config](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html): strict project-level typecheck configuration.
- [Playwright configuration](https://playwright.dev/docs/test-configuration) and [browser channels](https://playwright.dev/docs/browsers): locally installed Chrome channel, viewport/DPR, traces and screenshot test artifacts.
- Versions were obtained with `npm view <package> version` (plus Vite/Playwright engines) from the npm registry, then installed with `--save-exact`; see package.json and package-lock.json for the actual resolution. Documentation capability claims are separate from the local evidence in STATUS.md.
