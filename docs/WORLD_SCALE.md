# World scale and camera contract

All values below are starting design assumptions, not measurements from the artwork. One runtime unit = one meter. Three.js world is right-handed, +Y up; initial character forward convention is -Z. Confirm the Blender-to-glTF axis conversion using the fixture rather than applying a second rotation blindly.

Start player height at 1.75 m. Proposed capsule radius 0.30 m; controller height and camera eye level must be calibrated against that avatar. Door clear width at least 1.0 m; major paths 3–5 m; alleys preferably 1.8–2.5 m for camera space; stair rise about 0.16–0.18 m and tread about 0.28–0.32 m. Test rather than treating these as inflexible art rules. Never scale a whole city from pixel ratios alone.

Primary third-person camera: proposed 3–5 m follow distance, configurable FOV/sensitivity and obstruction handling. First-person shares physics and input state; hide only obstructing avatar parts, not the environment. Disable head-bob by default; expose reduced camera motion. Menus release pointer lock and suspend movement. A narrow alley must not cause camera teleporting or clipping through walls.

Initial test ground: a 64 × 64 m graybox. Initial art slice: approximately 96 × 96 m, adjusted after actual reference review. Two terraces, cottage, small garden/field, bridge, water and paths. No automatic kilometer-scale city yet.

Collision: simplified proxies, stairs supported by deliberate controller or ramp-proxy treatment, separate render mesh. Player and collision remain resident ahead of stream transitions. Safe spawn/reset for out-of-world or loading failure.
