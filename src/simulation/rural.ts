import { RURAL } from './rural-layout';
import type { BoxSpec, CourseSpec, Vec3 } from './types';

type Point = readonly [number, number];
type Surface = NonNullable<CourseSpec['surfaces']>[number];

/** Deliberate trees and useful fence lines are shared by render and simple collision. */
export const RURAL_TREES = [
  [-26, 4, -13, 1.05, 0], [-33, 4, -6, 0.88, 2], [-34, 4, -23, 1.12, 1],
  [-31, 4, -35, 1.05, 0], [-21, 4, -39, 0.8, 1], [-9, 7.4, -36, 1.02, 2],
  [3, 7.4, -38, 1.06, 0], [28, 7.4, -33, 1.12, 2], [34, 7.4, -24, 0.91, 1],
  [27, 4, -11, 1.05, 0], [23, 4, -3, 0.82, 2], [35, 4, -5, 0.91, 1],
  [-24, 0, 32, 1.08, 2], [-15, 0, 39, 0.87, 0], [21, 0, 37, 1.12, 0],
  [31, 0, 31, 0.89, 1], [14, 0, 45, 0.91, 2], [-36, 0, 42, 1.17, 0],
  [-42, 4, -13, 0.93, 1], [-40, 4, -34, 1.08, 2], [38, 7.4, -39, 1.2, 0],
  [43, 4, -13, 0.96, 2], [-4, 7.4, -46, 1.09, 1], [20, 7.4, -43, 1.12, 0],
] as const;

export const RURAL_FENCES = [
  { id: 'garden.west', a: [6.3, -6.4], b: [6.3, 2.1] },
  { id: 'garden.east', a: [14.5, -6.4], b: [14.5, 2.1] },
  { id: 'garden.north', a: [6.3, -6.4], b: [14.5, -6.4] },
  { id: 'garden.south-west', a: [6.3, 2.1], b: [8.1, 2.1] },
  { id: 'garden.south-east', a: [11.9, 2.1], b: [14.5, 2.1] },
] as const;

/** Ear clipping uses only authored polygon coordinates, with no render dependency. */
function triangulate(points: readonly Point[]) {
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const remaining = points.map((_, i) => i);
  if (area < 0) remaining.reverse();
  const result: number[] = [];
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  while (remaining.length > 3) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length]!;
      const b = remaining[i]!;
      const c = remaining[(i + 1) % remaining.length]!;
      if (cross(points[a]!, points[b]!, points[c]!) <= 0.000001) continue;
      if (remaining.some(p => p !== a && p !== b && p !== c &&
        cross(points[a]!, points[b]!, points[p]!) >= 0 &&
        cross(points[b]!, points[c]!, points[p]!) >= 0 &&
        cross(points[c]!, points[a]!, points[p]!) >= 0)) continue;
      result.push(a, c, b); // +Y normal: x/z winding is reversed.
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error('Invalid rural terrain polygon.');
  }
  result.push(remaining[0]!, remaining[2]!, remaining[1]!);
  return result;
}

function terrace(id: string, outline: readonly Point[], top: number, bottom: number, color: number): Surface[] {
  const vertices = outline.flatMap(p => [p[0], top, p[1]]);
  const topSurface: Surface = { id: `${id}.top`, vertices, indices: triangulate(outline), color };
  const sides: Surface = { id: `${id}.cliff`, vertices: [], indices: [], color: RURAL.palette.stone };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const offset = sides.vertices.length / 3;
    sides.vertices.push(a[0], top, a[1], b[0], top, b[1], a[0], bottom, a[1], b[0], bottom, b[1]);
    sides.indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
  }
  return [topSurface, sides];
}

function shore(id: string, outline: Surface): Surface {
  const vertices: number[] = [];
  const indices: number[] = [];
  const count = outline.vertices.length / 3;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const ax = outline.vertices[i * 3]!, az = outline.vertices[i * 3 + 2]!;
    const bx = outline.vertices[next * 3]!, bz = outline.vertices[next * 3 + 2]!;
    if (Math.abs(ax) > 47.9 && Math.abs(bx) > 47.9 || az < 0 || bz < 0 || az > 30 || bz > 30) continue;
    const length = Math.hypot(bx - ax, bz - az);
    const nx = (bz - az) / length, nz = -(bx - ax) / length;
    const k = vertices.length / 3;
    vertices.push(ax, -0.04, az, bx, -0.04, bz,
      ax + nx * 0.55, -0.40, az + nz * 0.55, bx + nx * 0.55, -0.40, bz + nz * 0.55,
      ax + nx * 1.5, -1.52, az + nz * 1.5, bx + nx * 1.5, -1.52, bz + nz * 1.5);
    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2,
      k + 2, k + 3, k + 4, k + 3, k + 5, k + 4);
  }
  return { id, vertices, indices, color: 0x807950 };
}

/** M2's authored terrain and collision are serializable and use exactly the same surfaces. */
export function createRuralCourse(): CourseSpec {
  const boxes: BoxSpec[] = [];
  const surfaces: Surface[] = [];
  const add = (id: string, position: Vec3, size: Vec3, color: number, visible = true) => {
    const box = { id, position, size, color, collides: true, visible };
    boxes.push(box);
    return box;
  };
  // The low bank is real ground, exposed below the cottage terrace and stair run.
  surfaces.push(...terrace('terrain.north-bank', [
    [-48, -48], [48, -48], [48, 7.5], [40, 7], [34, 8.4], [28, 7.4],
    [22, 8.7], [16, 9.2], [10, 8.5], [5, 10.3], [RURAL.bridge.x + 2.2, 12],
    [RURAL.bridge.x - 2.2, 12], [-8, 12.3], [-12, 10.5], [-17, 8], [-24, 8.7],
    [-31, 7], [-38, 8.4], [-44, 7.2], [-48, 8],
  ], 0, -4, RURAL.palette.grass));

  surfaces.push(...terrace('terrain.cottage-terrace', [
    [-48, -48], [48, -48], [48, -0.5], [39, 1.2], [35, 0.5], [30, 2.8],
    [26, 2.1], [21, 4.3], [17, 3.5], [12, 4.8], [4, 3.8], [-3, 3],
    [-10, 3], [-12, 5.2], [-17, 5.4], [-22, 2.4], [-28, 3.4],
    [-32, 1.5], [-38, 2.7], [-43, 1], [-48, 1.8],
  ], 4, 0, RURAL.palette.grass));
  // A few large irregular ledges break the escarpment into readable landforms.
  // They are authored geology, not rows of modular retaining blocks.
  surfaces.push(...terrace('terrain.east-lower-ledge', [
    [13, 3.3], [24, 2], [33, 1.3], [36, 3.8], [31, 5.9], [24, 5.4],
    [21, 6.6], [16, 6.2], [13, 5.1],
  ], 1.35, 0, RURAL.palette.grass));
  surfaces.push(...terrace('terrain.west-lower-ledge', [
    [-44, 0], [-33, 0.7], [-25, 2], [-22, 4.8], [-27, 5.7], [-35, 4.8],
    [-40, 5.5], [-45, 3.5],
  ], 1.75, 0, RURAL.palette.grass));
  surfaces.push(...terrace('terrain.crop-terrace', [
    [-18, -48], [48, -48], [48, -18], [35, -19], [29, -18], [24, -20],
    [18, -19], [12, -20.2], [7, -19.1], [4, -18.8], [-2, -20.5], [-10, -20.3], [-18, -20.3],
    [-21, -27], [-18, -35],
  ], 7.4, 4, RURAL.palette.grassLight));
  surfaces.push(...terrace('terrain.south-bank', [
    [-48, 26], [-38, 25.2], [-29, 27.5], [-20, 26], [-11, 28], [-6, 27],
    [RURAL.bridge.x - 2.2, 26], [RURAL.bridge.x + 2.2, 26], [8, 27.2],
    [19, 27.4], [30, 25.5], [39, 27], [48, 25.8],
    [48, 48], [-48, 48],
  ], 0, -4, RURAL.palette.grass));
  for (const id of ['terrain.north-bank.top', 'terrain.south-bank.top']) {
    const surface = surfaces.find(item => item.id === id)!;
    surfaces.push(shore(id.replace('.top', '.shore'), surface));
  }

  // 24 real stone risers, 16.67 cm by 30 cm. No hidden ramp.
  for (let i = 0; i < 24; i++) {
    const height = (24 - i) * 4 / 24;
    add(`stairs.main.${i}`, { x: -7, y: height / 2, z: 3.15 + i * 0.3 },
      { x: 3.6, y: height, z: 0.3 }, i % 3 ? 0x9a937a : 0xa59e84);
  }
  // Upper field access is placed to the west of the cottage, clear of its rear.
  for (let i = 0; i < 20; i++) {
    const height = (i + 1) * 0.17;
    add(`stairs.crop.${i}`, { x: -14, y: 4 + height / 2, z: -14.45 - i * 0.3 },
      { x: 3.2, y: height, z: 0.3 }, i % 3 ? 0x9a937a : 0xa59e84);
  }
  add('cottage.collider', { x: RURAL.cottage.x, y: RURAL.cottage.y + 1.85, z: RURAL.cottage.z },
    { x: RURAL.cottage.width, y: 3.7, z: RURAL.cottage.depth }, RURAL.palette.plaster, false);
  for (const [name, x, y, z, sx, sy, sz] of [
    ['front.lower', 0, 0.09, 3.92, 1.90, 0.18, 1.16],
    ['front.upper', 0, 0.26, 3.64, 1.64, 0.16, 0.65],
    ['front.threshold', 0, 0.395, 3.20, 1.60, 0.10, 0.56],
    ['rear.lower', 1.95, 0.09, -3.70, 1.60, 0.18, 0.94],
    ['rear.upper', 1.95, 0.26, -3.43, 1.42, 0.16, 0.50],
    ['rear.threshold', 1.95, 0.395, -3.20, 1.50, 0.10, 0.56],
  ] as const) {
    add(`cottage.step.${name}.collider`, { x: RURAL.cottage.x + x, y: RURAL.cottage.y + y, z: RURAL.cottage.z + z },
      { x: sx, y: sy, z: sz }, RURAL.palette.stone, false);
  }
  for (const [i, [x, z, radius, height]] of [[-3.99, -1.40, 0.435, 0.88], [-4.03, -0.47, 0.365, 0.71]].entries()) {
    add(`cottage.barrel.${i}.collider`, { x: RURAL.cottage.x + x!, y: RURAL.cottage.y + height! / 2, z: RURAL.cottage.z + z! },
      { x: radius! * 2, y: height!, z: radius! * 2 }, RURAL.palette.timber, false);
  }
  add('shed.collider', { x: RURAL.shed.x, y: RURAL.shed.y + 0.95, z: RURAL.shed.z },
    { x: RURAL.shed.width, y: 1.9, z: RURAL.shed.depth }, RURAL.palette.timber, false);
  add('bridge.deck.collider', { x: RURAL.bridge.x, y: -0.10, z: RURAL.bridge.z },
    { x: 3.6, y: 0.36, z: 14 }, RURAL.palette.timber, false);
  for (const side of [-1, 1]) {
    add(`bridge.rail.${side}.collider`, { x: RURAL.bridge.x + side * 1.65, y: 0.655, z: RURAL.bridge.z },
      { x: 0.26, y: 1.15, z: 13.65 }, RURAL.palette.timber, false);
  }
  for (const [i, [x, y, z, scale]] of RURAL_TREES.entries()) {
    add(`tree.${i}.collider`, { x, y: y + scale * 1.55, z },
      { x: 0.66 * scale, y: 3.1 * scale, z: 0.66 * scale }, RURAL.palette.timber, false);
  }
  for (const fence of RURAL_FENCES) {
    const dx = fence.b[0] - fence.a[0], dz = fence.b[1] - fence.a[1];
    const box: BoxSpec = add(`fence.${fence.id}.collider`,
      { x: (fence.a[0] + fence.b[0]) / 2, y: 4.54, z: (fence.a[1] + fence.b[1]) / 2 },
      { x: 0.15, y: 1.08, z: Math.hypot(dx, dz) }, RURAL.palette.timber, false);
    box.rotationY = Math.atan2(dx, dz);
  }
  for (let bed = 0; bed < 4; bed++) {
    add(`garden.bed.${bed}.collider`, { x: 10, y: 4.06, z: -5 + bed * 1.7 },
      { x: 6.8, y: 0.12, z: 1.15 }, RURAL.palette.soil, false);
  }
  add('garden.lantern.collider', { x: 15.35, y: 4.82, z: -3.8 },
    { x: 0.64, y: 1.64, z: 0.64 }, RURAL.palette.stone, false);
  return {
    id: RURAL.id, seed: RURAL.seed, bounds: RURAL.bounds,
    spawn: { x: -6, y: 4.04, z: 1.5 }, boxes, surfaces, labels: [],
    bookmarks: {
      spawn: { position: { x: -6, y: 4.04, z: 1.5 }, yaw: -0.55, pitch: -0.04 },
      stairs: { position: { x: -7, y: 0.04, z: 11.3 }, yaw: 0, pitch: -0.1 },
      cropStairs: { position: { x: -14, y: 4.04, z: -12.8 }, yaw: 0, pitch: -0.08 },
      bridge: { position: { x: RURAL.bridge.x, y: 0.04, z: 10.5 }, yaw: Math.PI, pitch: -0.12 },
      cottageFront: { position: { x: 0, y: 4.04, z: -1.0 }, yaw: 0, pitch: 0.08 },
      cottageRear: { position: { x: 0, y: 4.04, z: -13.5 }, yaw: Math.PI, pitch: 0.08 },
      cottageWest: { position: { x: -6.3, y: 4.04, z: -7 }, yaw: -Math.PI / 2, pitch: 0.05 },
      cottageEast: { position: { x: 4.95, y: 4.04, z: -7 }, yaw: Math.PI / 2, pitch: 0.05 },
      bank: { position: { x: -1, y: 0.04, z: 10.7 }, yaw: Math.PI, pitch: -0.2 },
      garden: { position: { x: 9, y: 4.04, z: 2.8 }, yaw: 0, pitch: -0.17 },
    },
  };
}
