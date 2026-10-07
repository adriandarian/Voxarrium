// Same bounded M8 actual-input protocol and acceptance thresholds, extended route.
process.env.VOXARRIUM_STRESS_SCENE='m9';
process.env.VOXARRIUM_STREAMING_DIR??=`artifacts/m9/stress/${process.env.VOXARRIUM_WEATHER??'rain'}-${process.env.VOXARRIUM_LIGHT??'dusk'}`;
await import('./stress-core.mjs');
