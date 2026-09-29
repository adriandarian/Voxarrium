import type { BoxSpec, CourseSpec, Vec3 } from './types';

/** Authored meters, stable IDs and no runtime randomness; seed identifies this course. */
export function createCourse(seed = 240928): CourseSpec {
  const boxes: BoxSpec[] = [];
  const stone = 0xb4b0a4;
  const add = (id: string, position: Vec3, size: Vec3, color = stone, collides = true): BoxSpec => {
    const box: BoxSpec = { id, position, size, color, collides };
    boxes.push(box);
    return box;
  };
  add('ground.main', { x: 0, y: -0.5, z: 6 }, { x: 64, y: 1, z: 52 }, 0x777f70);
  add('ground.north-bank', { x: 0, y: -0.5, z: -29 }, { x: 64, y: 1, z: 6 }, 0x777f70);
  add('water.height-placeholder', { x: 0, y: -2, z: -23 }, { x: 64, y: 0.08, z: 6 }, 0x438c98, false);
  add('diagnostics.scale-cube.collider', { x: -4, y: 0.5, z: 10 }, { x: 1, y: 1, z: 1 }).visible = false;

  const ramp = (id: string, x: number, bottomZ: number, run: number, rise: number, width: number) => {
    const angle = Math.atan2(rise, run);
    const thickness = 0.2;
    const box = add(id, {
      x, y: rise / 2 - thickness / 2 * Math.cos(angle),
      z: bottomZ - run / 2 - thickness / 2 * Math.sin(angle),
    }, { x: width, y: thickness, z: Math.hypot(run, rise) }, 0xc5b58d);
    box.rotationX = angle;
  };
  ramp('slope.gentle-14deg', 0, -3, 8, 2, 4);
  add('slope.gentle-landing', { x: 0, y: 1, z: -12.5 }, { x: 4, y: 2, z: 3 });
  ramp('slope.steep-53deg', 8, -3, 3, 4, 3.5);
  add('slope.steep-landing', { x: 8, y: 2, z: -7 }, { x: 3.5, y: 4, z: 2 }, 0xb09d80);

  // Each riser is a real collider, 0.17 m high with a 0.30 m tread.
  // This deliberately exercises Rapier autostep; there is no hidden ramp.
  for (let step = 0; step < 8; step++) {
    const height = (step + 1) * 0.17;
    add(`stairs.step-${step + 1}`, { x: -12, y: height / 2, z: -3.15 - step * 0.30 },
      { x: 3, y: height, z: 0.30 }, step % 2 ? 0xc5beb0 : 0xd0cabc);
  }
  add('terrace.deck', { x: -12, y: 0.68, z: -9.2 }, { x: 7, y: 1.36, z: 7.6 });
  add('terrace.back-wall', { x: -12, y: 2.06, z: -12.8 }, { x: 7, y: 1.4, z: 0.35 });

  // Clear opening 1.10 m wide and 2.20 m high.
  add('doorway.left-jamb', { x: -13.175, y: 1.1, z: 7 }, { x: 1.25, y: 2.2, z: 0.55 });
  add('doorway.right-jamb', { x: -10.825, y: 1.1, z: 7 }, { x: 1.25, y: 2.2, z: 0.55 });
  add('doorway.lintel', { x: -12, y: 2.45, z: 7 }, { x: 3.6, y: 0.5, z: 0.55 });

  // 2.10 m clear alley, tall enough to exercise the follow camera.
  add('alley.west', { x: 12.7, y: 1.65, z: 7 }, { x: 0.5, y: 3.3, z: 10 }, 0x9b9b92);
  add('alley.east', { x: 15.3, y: 1.65, z: 7 }, { x: 0.5, y: 3.3, z: 10 }, 0x9b9b92);

  // An intentionally non-traversable 1.55 m opening beside a 2.05 m one.
  add('low-clearance.roof', { x: 4.5, y: 1.8, z: 7.5 }, { x: 3, y: 0.5, z: 3 });
  add('low-clearance.west', { x: 2.85, y: 0.775, z: 7.5 }, { x: 0.3, y: 1.55, z: 3 });
  add('low-clearance.east', { x: 6.15, y: 0.775, z: 7.5 }, { x: 0.3, y: 1.55, z: 3 });
  add('head-clearance.roof', { x: -4.5, y: 2.25, z: 3 }, { x: 3, y: 0.4, z: 3 });
  add('head-clearance.west', { x: -6.15, y: 1.025, z: 3 }, { x: 0.3, y: 2.05, z: 3 });
  add('head-clearance.east', { x: -2.85, y: 1.025, z: 3 }, { x: 0.3, y: 2.05, z: 3 });

  add('wall.collision', { x: 22, y: 1.8, z: -4 }, { x: 8, y: 3.6, z: 0.55 }, 0x97938b);
  add('bridge.deck', { x: 10, y: -0.04, z: -23 }, { x: 3.4, y: 0.32, z: 8 }, 0xb8a98c);
  add('bridge.rail-west', { x: 8.38, y: 0.67, z: -23 }, { x: 0.16, y: 1.1, z: 7.8 });
  add('bridge.rail-east', { x: 11.62, y: 0.67, z: -23 }, { x: 0.16, y: 1.1, z: 7.8 });

  return {
    id: 'm1-human-scale-64m', seed, spawn: { x: 0, y: 0.03, z: 16 }, boxes,
    labels: [
      { text: 'GENTLE SLOPE / 14°', position: { x: 0, y: 0.05, z: -0.8 } },
      { text: 'STEEP SLOPE / 53°', position: { x: 8, y: 0.05, z: -0.8 } },
      { text: 'STAIRS / 17 × 30 cm', position: { x: -12, y: 0.05, z: -0.8 } },
      { text: 'DOORWAY / 1.10 m', position: { x: -12, y: 0.05, z: 9 } },
      { text: 'ALLEY / 2.10 m', position: { x: 14, y: 0.05, z: 14 } },
      { text: 'LOW / 1.55 m', position: { x: 4.5, y: 0.05, z: 10.5 } },
      { text: 'HEADROOM / 2.05 m', position: { x: -4.5, y: 0.05, z: 5.5 } },
      { text: 'BRIDGE / 3.24 m', position: { x: 10, y: 0.05, z: -17.5 } },
      { text: 'DROP / WATER DATUM −2 m', position: { x: -3, y: 0.05, z: -18.3 } },
    ],
    bookmarks: {
      spawn: { position: { x: 0, y: 0.03, z: 16 }, yaw: 0, pitch: -0.16 },
      slope: { position: { x: 0, y: 0.03, z: -1 }, yaw: 0, pitch: -0.12 },
      steepSlope: { position: { x: 8, y: 0.03, z: -1 }, yaw: 0, pitch: -0.12 },
      stairs: { position: { x: -12, y: 0.03, z: -1 }, yaw: 0, pitch: -0.12 },
      doorway: { position: { x: -12, y: 0.03, z: 10 }, yaw: 0, pitch: 0 },
      alley: { position: { x: 14, y: 0.03, z: 14 }, yaw: 0, pitch: -0.10 },
      lowCeiling: { position: { x: 4.5, y: 0.03, z: 11 }, yaw: 0, pitch: 0 },
      headroom: { position: { x: -4.5, y: 0.03, z: 6 }, yaw: 0, pitch: 0 },
      wall: { position: { x: 22, y: 0.03, z: -1 }, yaw: 0, pitch: -0.08 },
      bridge: { position: { x: 10, y: 0.03, z: -17 }, yaw: 0, pitch: -0.10 },
      terrace: { position: { x: -12, y: 1.39, z: -8 }, yaw: Math.PI, pitch: -0.18 },
      drop: { position: { x: -3, y: 0.03, z: -18 }, yaw: 0, pitch: -0.18 },
      obstruction: { position: { x: 22, y: 0.03, z: -2.8 }, yaw: Math.PI, pitch: -0.08 },
    },
  };
}
