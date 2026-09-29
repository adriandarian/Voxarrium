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
