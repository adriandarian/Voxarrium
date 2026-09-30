import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color,
  Float32BufferAttribute, Group, InstancedMesh, Mesh,
  MeshStandardMaterial, Object3D, PlaneGeometry, SphereGeometry, Vector3,
} from 'three';
import { RURAL } from '../simulation/rural-layout';
import { RURAL_FENCES } from '../simulation/rural';
import type { CourseSpec } from '../simulation/types';
import { applyLandscapeUV, createLandscapeMaterials } from './landscape-materials';
import { blade, combined, lobe, pigment, randomSequence } from './rural-geometry';
import { addGroundEcology, placeTrees, registerEcology } from './rural-ecology';

type PathPoint = readonly [number, number];
type Lane = { points: PathPoint[]; width: number; y: number; name: string };

export const LANES: Lane[] = [
  { points: [[-28, -48], [-25, -39], [-27, -31], [-25, -23], [-20, -17], [-16, -10], [-17, -5], [-17, -1], [-15, 2.4], [-12, 3.2], [-9.5, 1.6], [-7, 1.2], [-7, 3]], width: 3.4, y: 4.028, name: 'main-cottage' },
  { points: [[-7, 10.2], [-6.7, 11], [-4.5, 10.5], [RURAL.bridge.x, 10.5], [RURAL.bridge.x, 12]], width: 3.0, y: 0.028, name: 'bank-bridge' },
  { points: [[RURAL.bridge.x, 26], [RURAL.bridge.x, 28], [5, 31], [9, 35], [8, 40], [3, 45], [2, 48]], width: 3.8, y: 0.03, name: 'south' },
  { points: [[-14, 1], [-8, -0.5], [-3, -1.8], [1, -1.4], [4, 1.1], [6.5, 3], [10, 3], [10, 1.6]], width: 2.35, y: 4.037, name: 'cottage-door-garden' },
  { points: [[-19, -14], [-16.5, -13.2], [-14, -13.3], [-14, -14.3]], width: 2.8, y: 4.032, name: 'crop-approach' },
  { points: [[-14, -20.3], [-14, -23], [-9, -24], [-5, -25], [2, -25]], width: 2.8, y: 7.428, name: 'crop-upper' },
];

function sampledLane(points: readonly PathPoint[]) {
  return new CatmullRomCurve3(points.map(point => new Vector3(point[0], 0, point[1])), false, 'catmullrom', 0.25)
    .getPoints(points.length * 14).map(point => [point.x, point.z] as const);
}

function laneProfile(distance: number, width: number, phase: number) {
  const common = Math.sin(distance * 0.34 + phase) * 0.044 + Math.sin(distance * 0.79 - phase) * 0.025;
  return {
    left: width * (0.5 + common + Math.sin(distance * 0.53 + phase * 1.7) * 0.046),
    right: width * (0.5 + common + Math.sin(distance * 0.41 - phase * 1.3) * 0.041),
  };
}

/** Unequal soft margins and broad worn bands preserve a continuous readable walking core. */
function pathMesh(points: readonly PathPoint[], width: number, y: number, material: MeshStandardMaterial, name: string) {
  const samples = sampledLane(points);
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const bands = [-1, -0.78, -0.46, 0, 0.46, 0.78, 1];
  const phase = points[0]![0] * 0.61 + points[0]![1] * 0.27;
  let distance = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const a = samples[Math.max(0, i - 1)]!;
    const b = samples[Math.min(samples.length - 1, i + 1)]!;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (i) distance += Math.hypot(p[0] - samples[i - 1]![0], p[1] - samples[i - 1]![1]);
    const edge = laneProfile(distance, width, phase);
    const wear = 0.93 + Math.sin(distance * 0.42 + phase) * 0.055 + Math.sin(distance * 0.17 - phase) * 0.035;
    for (const band of bands) {
      const offset = band * (band > 0 ? edge.left : edge.right);
      vertices.push(p[0] + dz / length * offset, y, p[1] - dx / length * offset);
      const margin = Math.max(0, (Math.abs(band) - 0.42) / 0.58);
      const color = new Color(0xf2e8ca).lerp(new Color(0x849153), margin * (0.44 + Math.sin(distance * 0.6 + band * 2 + phase) * 0.10));
      color.multiplyScalar(wear * (1 - margin * 0.12));
      colors.push(color.r, color.g, color.b);
    }
    if (i) for (let band = 0; band < bands.length - 1; band++) {
      const k = i * bands.length + band, a = k - bands.length;
      indices.push(a, a + 1, k, a + 1, k + 1, k);
    }
  }
  // The field footpath peters out in an irregular rounded worn patch instead of a square cut.
  if (name === 'path.crop-upper') {
    const p = samples.at(-1)!, before = samples.at(-2)!;
    const dx = p[0] - before[0], dz = p[1] - before[1], length = Math.hypot(dx, dz);
    const center = vertices.length / 3;
    vertices.push(p[0], y, p[1]);
    const color = new Color(0xe4dcba); colors.push(color.r, color.g, color.b);
    for (let segment = 0; segment <= 12; segment++) {
      const angle = -Math.PI / 2 + segment / 12 * Math.PI;
      const radius = width * (0.49 + Math.sin(segment * 0.85 + phase) * 0.036);
      vertices.push(p[0] + (dx * Math.cos(angle) + dz * Math.sin(angle)) / length * radius,
        y, p[1] + (dz * Math.cos(angle) - dx * Math.sin(angle)) / length * radius);
      const edgeColor = color.clone().lerp(new Color(0x849153), 0.47); colors.push(edgeColor.r, edgeColor.g, edgeColor.b);
      if (segment) indices.push(center, center + segment, center + segment + 1);
    }
  }
  const geometry = new BufferGeometry();
  // Tight curved joins may invert a ribbon triangle; all lane faces must stay +Y.
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const normalY = (vertices[b + 2]! - vertices[a + 2]!) * (vertices[c]! - vertices[a]!) -
      (vertices[b]! - vertices[a]!) * (vertices[c + 2]! - vertices[a + 2]!);
    if (normalY < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  }
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  applyLandscapeUV(geometry, 'ground');
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

/** Stage one: composition massing. Detailed ecology is deliberately gated by review. */
export function createRuralEnvironment(course: CourseSpec, blockout: boolean) {
  const group = new Group();
  group.name = 'rural.environment';
  const palette = RURAL.palette;
  const material = (color: number) => new MeshStandardMaterial({ color, roughness: 0.95 });
  const landscape = createLandscapeMaterials();
  const path = landscape.path;
  path.vertexColors = true;
  path.polygonOffset = true;
  path.polygonOffsetFactor = -1;
  path.polygonOffsetUnits = -2;
  const cube = new BoxGeometry(1, 1, 1);
  const addBox = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) => {
    const mesh = new Mesh(cube, material(color));
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  for (const lane of LANES) group.add(pathMesh(lane.points, lane.width, lane.y, path, `path.${lane.name}`));
  for (let bed = 0; bed < 4; bed++) {
    const mesh = addBox(`garden.bed.${bed}`, 10, 4.06, -5 + bed * 1.7, 6.8, 0.12, 1.15, palette.soil);
    mesh.material = landscape.soil;
  }

  if (blockout) {
    addBox('water.mass', 0, -1.2, 19, 96, 0.09, 28, palette.water).castShadow = false;
    addBox('crop.field-mass', RURAL.wheat.x, 7.49, RURAL.wheat.z, RURAL.wheat.width, 0.1, RURAL.wheat.depth, 0x938545);
    addBox('blockout.cottage', 0, 5.93, -7, 7.2, 3.7, 6.2, palette.plaster);
    // A triangular prism preserves a readable roof silhouette during composition review.
    const roof = new BufferGeometry();
    roof.setAttribute('position', new Float32BufferAttribute([
      -4.2, 7.8, -10.6, 4.2, 7.8, -10.6, 0, 10.1, -10.6,
      -4.2, 7.8, -3.4, 4.2, 7.8, -3.4, 0, 10.1, -3.4,
    ], 3));
    roof.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3]);
    roof.computeVertexNormals();
    const roofMesh = new Mesh(roof, material(palette.terracotta));
    roofMesh.name = 'blockout.cottage-roof';
    roofMesh.castShadow = true;
    group.add(roofMesh);
    addBox('blockout.shed', -10, 5, -1, 3, 1.9, 2.8, palette.timber);
    addBox('blockout.shed-roof', -10, 6.1, -1, 3.6, 0.5, 3.4, palette.teal);
    addBox('blockout.bridge-deck', RURAL.bridge.x, -0.1, RURAL.bridge.z, 3.6, 0.36, 14, 0x87613d);
    for (const side of [-1, 1]) addBox(`blockout.bridge-rail.${side}`, RURAL.bridge.x + side * 1.74, 1, RURAL.bridge.z, 0.14, 0.16, 13.6, 0x6c482c);
    const crown = new SphereGeometry(1, 8, 6);
    for (const [index, entry] of [
      [-26, 4, -13, 8], [-28, 4, -31, 9], [-3, 7.4, -34, 9], [25, 7.4, -29, 10],
      [29, 4, -7, 9], [22, 4, 1, 7], [-24, 0, 31, 8], [28, 0, 36, 9], [-10, 0, 39, 7],
    ].entries()) {
      const [x, y, z, height] = entry as [number, number, number, number];
      addBox(`blockout.tree-trunk.${index}`, x, y + height * 0.35, z, 0.6, height * 0.7, 0.6, palette.timber);
      const mesh = new Mesh(crown, material(index % 2 ? 0x4e612f : 0x5b7036));
      mesh.name = `blockout.tree-crown.${index}`;
      mesh.position.set(x, y + height * 0.75, z);
      mesh.scale.set(height * 0.32, height * 0.4, height * 0.30);
      mesh.castShadow = true;
      group.add(mesh);
    }
    return { group, update(_elapsed: number) { /* Static composition evidence. */ } };
  }
  return addDetailedEnvironment(group, course, landscape);
}

function fracturedRockGeometry(variant: number) {
  const geometry = new BufferGeometry();
  const outline = variant === 0 ? [
    [-1, -0.84, 0.23], [0.35, -1, 0.47], [1, -0.47, 0.23], [0.77, 0.65, 0.36],
    [0.14, 1, 0.51], [-0.78, 0.76, 0.24],
  ] : [
    [-0.82, -1, 0.33], [0.72, -0.80, 0.40], [0.93, 0.22, 0.54], [0.58, 0.94, 0.27],
    [-0.46, 1, 0.49], [-1, -0.12, 0.31],
  ];
  const vertices = outline.flat();
  vertices.push(-0.12, 0.08, 0.79);
  for (const p of outline) vertices.push(p[0]!, p[1]!, -0.35);
  const indices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    indices.push(i, next, 6, i, i + 7, next, next, i + 7, next + 7);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return pigment(geometry, variant ? 0x7f7b61 : 0x777660, 0.085);
}

function wornStepGeometry(variant: number) {
  const outline = variant ? [
    [-0.47, -0.43], [-0.35, -0.5], [0.38, -0.49], [0.5, -0.37],
    [0.48, 0.39], [0.35, 0.48], [-0.40, 0.5], [-0.5, 0.36],
  ] : [
    [-0.5, -0.38], [-0.40, -0.49], [0.35, -0.5], [0.48, -0.39],
    [0.5, 0.36], [0.39, 0.5], [-0.37, 0.48], [-0.49, 0.38],
  ];
  const positions: number[] = [], indices: number[] = [];
  for (const [ring, height] of [-0.5, 0.28, 0.5].entries()) for (const p of outline) {
    const inset = ring === 2 ? 0.91 : ring === 0 ? 0.98 : 1;
    positions.push(p[0]! * inset, height, p[1]! * inset);
  }
  positions.push(0, 0.5, 0, 0, -0.5, 0);
  for (let side = 0; side < 8; side++) {
    const next = (side + 1) % 8;
    for (let ring = 0; ring < 2; ring++) {
      const a = ring * 8 + side, b = ring * 8 + next;
      indices.push(a, a + 8, b, b, a + 8, b + 8);
    }
    indices.push(24, 16 + next, 16 + side);
    indices.push(25, side, next);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return pigment(geometry, variant ? 0x8e8f73 : 0xa2a084, 0.045);
}

/** A thin asymmetric soil/moss island, anchored to a real supporting surface. */
function groundPatch(color: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, 0.009, 0, -0.87, 0, -0.18, -0.51, 0, -0.70, 0.17, 0, -0.77,
    0.79, 0, -0.44, 1, 0, 0.14, 0.36, 0, 0.77, -0.36, 0, 0.64, -0.89, 0, 0.35,
  ], 3));
  const indices: number[] = [];
  for (let i = 1; i <= 8; i++) indices.push(0, i === 8 ? 1 : i + 1, i);
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return pigment(geometry, color, 0.055);
}

type Placement = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; tint: number };
type Batch = { geometry: BufferGeometry; positions: Placement[]; shadows: boolean };

function addDetailedEnvironment(group: Group, course: CourseSpec, landscape: ReturnType<typeof createLandscapeMaterials>) {
  const random = randomSequence(RURAL.seed);
  const surfaces = course.surfaces ?? [];
  const ground = surfaces.filter(surface => surface.id.endsWith('.top'));
  function inside(x: number, z: number, vertices: number[]) {
    let included = false;
    for (let i = 0, j = vertices.length / 3 - 1; i < vertices.length / 3; j = i++) {
      const xi = vertices[i * 3]!, zi = vertices[i * 3 + 2]!, xj = vertices[j * 3]!, zj = vertices[j * 3 + 2]!;
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) included = !included;
    }
    return included;
  }
  function groundHeight(x: number, z: number) {
    let y = -4;
    for (const surface of ground) if (inside(x, z, surface.vertices)) y = Math.max(y, surface.vertices[1]!);
    return y;
  }
  const laneSamples = LANES.map(lane => ({ ...lane, samples: sampledLane(lane.points) }));
  function pathDistance(x: number, z: number, y: number) {
    let nearest = 100;
    for (const lane of laneSamples) {
      if (Math.abs(lane.y - y) > 0.2) continue;
      for (const point of lane.samples) nearest = Math.min(nearest, Math.hypot(point[0] - x, point[1] - z) - lane.width / 2);
    }
    return nearest;
  }
  function occupied(x: number, z: number, y: number, extra = 0) {
    if (Math.abs(x) > 46 || Math.abs(z) > 46 || y < -0.1) return true;
    if (Math.hypot(x - course.spawn.x, z - course.spawn.z) < 1.2 + extra) return true;
    if (Math.abs(x) < 4.3 + extra && Math.abs(z + 7) < 3.9 + extra) return true;
    if (Math.abs(x + 10) < 2.1 + extra && Math.abs(z + 1) < 2.0 + extra) return true;
    if (x > 4.9 - extra && x < 15 + extra && z > -7 - extra && z < 2.7 + extra) return true;
    if (Math.abs(x - RURAL.wheat.x) < 9.5 && Math.abs(z - RURAL.wheat.z) < 5.9) return true;
    if (Math.abs(x + 7) < 2.3 + extra && z > 1.9 && z < 11.8) return true;
    if (Math.abs(x + 14) < 2.1 + extra && z > -21.1 && z < -12.4) return true;
    return false;
  }
  function reserved(x: number, z: number, y: number, extra = 0) {
    return occupied(x, z, y, extra) || pathDistance(x, z, y) < extra;
  }
  const library = new Map<string, Batch>();
  function register(name: string, geometry: BufferGeometry, shadows = false) { library.set(name, { geometry, shadows, positions: [] }); }
  function put(name: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, yaw = random() * Math.PI * 2, tint = 0.91 + random() * 0.18) {
    library.get(name)!.positions.push({ x, y, z, sx, sy, sz, yaw, tint });
  }
  registerEcology(register);
  register('rock', lobe(0, 0, 0, 1, 0.8, 0.75, 0x7d7c61), true);
  register('fracture-0', fracturedRockGeometry(0), true);
  register('fracture-1', fracturedRockGeometry(1), true);
  register('fracture-slate', fracturedRockGeometry(0).rotateZ(0.31), true);
  register('fracture-chip', fracturedRockGeometry(1).rotateZ(-0.39), true);
  register('small-stone', lobe(0, 0.05, 0, 0.26, 0.13, 0.20, 0x989176), false);
  register('moss', lobe(0, 0, 0, 1, 0.13, 0.8, 0x667338), false);
  register('soil-island', groundPatch(0x827043));
  register('moss-island', groundPatch(0x68793e));
  register('cliff-soil-streak', groundPatch(0x757654).rotateX(Math.PI / 2));
  register('crevice-trailer', combined(Array.from({ length: 7 }, (_, leaf) => {
    const geometry = blade(-(0.22 + leaf % 3 * 0.09), 0.052 + leaf % 2 * 0.025, 0.09, leaf % 2 ? 0x607440 : 0x6b7b42);
    geometry.rotateZ((leaf - 3) * 0.095); geometry.translate((leaf - 3) * 0.024, -leaf % 2 * 0.028, 0.03);
    return geometry;
  })));
  register('step-stone-0', wornStepGeometry(0), true);
  register('step-stone-1', wornStepGeometry(1), true);
  register('wood', pigment(new BoxGeometry(1, 1, 1), 0x715437, 0.15), true);
  register('edging', pigment(new BoxGeometry(1, 1, 1), 0x76684b, 0.13), true);

  placeTrees(put);

  // Rows are purposeful agriculture; the heads and stalks vary within each row.
  const cropSurface = surfaces.find(surface => surface.id === 'terrain.crop-terrace.top')!;
  const fieldVertices: number[] = [];
  const clip = (polygon: PathPoint[], axis: 0 | 1, boundary: number, keepGreater: boolean) => {
    const output: PathPoint[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const insideA = keepGreater ? a[axis] >= boundary : a[axis] <= boundary;
      const insideB = keepGreater ? b[axis] >= boundary : b[axis] <= boundary;
      if (insideA) output.push(a);
      if (insideA !== insideB) { const t = (boundary - a[axis]) / (b[axis] - a[axis]); output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return output;
  };
  for (let i = 0; i < cropSurface.indices.length; i += 3) {
    let polygon: PathPoint[] = cropSurface.indices.slice(i, i + 3).map(index => [cropSurface.vertices[index * 3]!, cropSurface.vertices[index * 3 + 2]!] as const);
    polygon = clip(polygon, 0, RURAL.wheat.x - 9, true); polygon = clip(polygon, 0, RURAL.wheat.x + 9, false);
    polygon = clip(polygon, 1, RURAL.wheat.z - 5.5, true); polygon = clip(polygon, 1, RURAL.wheat.z + 5.5, false);
    for (let j = 1; j < polygon.length - 1; j++) for (const p of [polygon[0]!, polygon[j]!, polygon[j + 1]!]) fieldVertices.push(p[0], 7.42, p[1]);
  }
  const fieldGeometry = new BufferGeometry(); fieldGeometry.setAttribute('position', new Float32BufferAttribute(fieldVertices, 3)); fieldGeometry.computeVertexNormals(); applyLandscapeUV(fieldGeometry, 'ground');
  const field = new Mesh(fieldGeometry, landscape.soil);
  field.name = 'crop.tilled-earth'; field.receiveShadow = true; group.add(field);
  for (let row = 0; row < 30; row++) for (let plant = 0; plant < 52; plant++) {
    const x = RURAL.wheat.x - 8.65 + plant * 0.337 + (random() - 0.5) * 0.15;
    const z = RURAL.wheat.z - 5.10 + row * 0.35 + (random() - 0.5) * 0.12;
    if (groundHeight(x, z) > 7.3) put('wheat', x, 7.44, z, 0.88 + random() * 0.27, 0.8 + random() * 0.4, 0.9 + random() * 0.24);
  }

  for (const fence of RURAL_FENCES) {
    const dx = fence.b[0] - fence.a[0], dz = fence.b[1] - fence.a[1];
    const length = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const panels = Math.ceil(length / 1.65);
    for (let i = 0; i <= panels; i++) {
      const t = i / panels;
      put('wood', fence.a[0] + dx * t, 4.63, fence.a[1] + dz * t, 0.16, 1.28 + random() * 0.09, 0.17, yaw, 0.90 + random() * 0.18);
    }
    for (const rail of [4.47, 4.96]) put('wood', (fence.a[0] + fence.b[0]) / 2, rail,
      (fence.a[1] + fence.b[1]) / 2, 0.11, 0.12, length, yaw);
  }
  for (let bed = 0; bed < 4; bed++) {
    const z = -5 + bed * 1.7;
    for (const sign of [-1, 1]) {
      put('edging', 10, 4.15, z + sign * 0.60, 6.95, 0.22, 0.13, 0);
      put('edging', 10 + sign * 3.48, 4.15, z, 0.13, 0.22, 1.28, 0);
    }
    for (let row = 0; row < 2; row++) for (let plant = 0; plant < 17; plant++) {
      const x = 6.8 + plant * 0.39;
      if (bed === 2) put('yellow', x, 4.13, z - 0.25 + row * 0.5, 0.74);
      else put(bed === 0 ? 'shrub' : 'weed', x, 4.12, z - 0.25 + row * 0.5, bed === 0 ? 0.26 : 0.72, bed === 0 ? 0.36 : 0.83);
    }
  }
  // An inferred working garden lantern, echoing the reference marker without adding clutter.
  put('rock', 15.35, 4.22, -3.8, 0.52, 0.32, 0.52, 0);
  put('edging', 15.35, 4.68, -3.8, 0.35, 0.86, 0.35, 0);
  put('wood', 15.35, 5.17, -3.8, 0.57, 0.10, 0.57, 0);
  put('wood', 15.35, 5.63, -3.8, 0.66, 0.12, 0.66, 0);
  for (const x of [-0.22, 0.22]) for (const z of [-0.22, 0.22]) put('wood', 15.35 + x, 5.4, -3.8 + z, 0.065, 0.40, 0.065, 0);
  const lanternGlass = new Mesh(new BoxGeometry(0.34, 0.30, 0.34), new MeshStandardMaterial({ color: 0xc0a561, roughness: 0.45 }));
  lanternGlass.name = 'garden.lantern.inferred'; lanternGlass.position.set(15.35, 5.4, -3.8); group.add(lanternGlass);

  addGroundEcology({ random, groundHeight, pathDistance, reserved, put });

  // Verge growth follows long unequal patches; isolated inset pebbles stay flush with the soil.
  for (const lane of laneSamples) {
    const phase = lane.points[0]![0] * 0.61 + lane.points[0]![1] * 0.27;
    let distance = 0;
    for (let i = 1; i < lane.samples.length - 1; i++) {
      const p = lane.samples[i]!, before = lane.samples[i - 1]!, after = lane.samples[i + 1]!;
      distance += Math.hypot(p[0] - before[0], p[1] - before[1]);
      if (random() < 0.42) continue;
      const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz);
      const edge = laneProfile(distance, lane.width, phase);
      for (const sign of [-1, 1]) {
        const patch = Math.sin(distance * 0.74 + phase + sign * 2.4) + Math.sin(distance * 0.29 - sign);
        if (patch < -0.55) continue;
        const verge = sign > 0 ? edge.left : edge.right;
        for (let tuft = 0; tuft < 1 + Math.floor((patch + 2) * 1.5); tuft++) {
          const offset = verge + (random() - 0.42) * 0.8;
          const along = (random() - 0.5) * 0.75;
          const x = p[0] + sign * dz / length * offset + dx / length * along;
          const z = p[1] - sign * dx / length * offset + dz / length * along;
          const y = groundHeight(x, z);
          if (Math.abs(y - lane.y) > 0.1 || occupied(x, z, y, 0.08) || pathDistance(x, z, y) < -lane.width * 0.20) continue;
          put(tuft % 5 === 0 ? 'weed' : 'short', x, y + 0.013, z, 0.50 + random() * 0.58, 0.5 + random() * 0.48);
          if (tuft === 0 && patch > 0.15) put('moss-island', x, lane.y + 0.006, z, 0.3 + random() * 0.45, 1, 0.15 + random() * 0.23);
        }
        if (random() > 0.52) {
          const offset = verge * (0.50 + random() * 0.63);
          const x = p[0] + sign * dz / length * offset, z = p[1] - sign * dx / length * offset;
          if (Math.abs(groundHeight(x, z) - lane.y) < 0.1 && !occupied(x, z, lane.y, 0.04)) {
            const pebbles = patch > 0.85 ? 2 + Math.floor(random() * 3) : 1;
            for (let pebble = 0; pebble < pebbles; pebble++) {
              const px = x + (random() - 0.5) * 0.65, pz = z + (random() - 0.5) * 0.65;
              if (Math.abs(groundHeight(px, pz) - lane.y) > 0.1 || occupied(px, pz, lane.y, 0.04)) continue;
              put('small-stone', px, lane.y - 0.008, pz, 0.32 + random() * 0.62, 0.24 + random() * 0.27, 0.40 + random() * 0.66, random() * Math.PI * 2, 0.78 + random() * 0.24);
            }
          }
        }
      }
    }
  }

  // The reliable M2 cuboids remain collision-only. All worn slab tops are within 2 cm of them.
  for (const run of ['main', 'crop']) {
    const steps = course.boxes.filter(box => box.id.startsWith(`stairs.${run}.`));
    const base = run === 'main' ? 0 : 4;
    const supportVertices: number[] = [], supportIndices: number[] = [];
    for (const step of steps) {
      const top = step.position.y + step.size.y / 2;
      const height = run === 'main' ? 0.205 : 0.208;
      const widths = [step.size.x * (0.26 + random() * 0.10), step.size.x * (0.30 + random() * 0.09)];
      widths.push(step.size.x - widths[0]! - widths[1]!);
      let left = step.position.x - step.size.x / 2;
      for (const [stone, width] of widths.entries()) {
        const center = left + width / 2;
        put(`step-stone-${(stone + Number(step.id.split('.').at(-1))) % 2}`, center,
          top + 0.010 - height / 2, step.position.z + (random() - 0.5) * 0.018,
          width + 0.015, height, step.size.z + 0.04 + random() * 0.028, (random() - 0.5) * 0.018, 0.83 + random() * 0.25);
        left += width;
        if (stone < widths.length - 1 && random() > 0.85) {
          put('moss-island', left, top + 0.012, step.position.z + (random() - 0.5) * 0.10, 0.018 + random() * 0.023, 0.10, 0.075 + random() * 0.035, 0, 0.8 + random() * 0.15);
          if (random() > 0.68) put('short', left, top + 0.006, step.position.z + 0.04, 0.17 + random() * 0.09, 0.20, 0.23);
        }
      }
      // A continuous earth/stone core grounds the visible stair sides rather than leaving a hollow shell.
      for (const sign of [-1, 1]) {
        const x = step.position.x + sign * (step.size.x / 2 + 0.31 + random() * 0.04);
        const innerX = step.position.x + sign * (step.size.x / 2 - 0.075);
        const z0 = step.position.z - step.size.z / 2, z1 = step.position.z + step.size.z / 2;
        const k = supportVertices.length / 3;
        supportVertices.push(x, base, z0, x, top - 0.03, z0, x, top - 0.03, z1, x, base, z1);
        supportIndices.push(k, k + (sign > 0 ? 1 : 2), k + (sign > 0 ? 2 : 1), k, k + (sign > 0 ? 2 : 3), k + (sign > 0 ? 3 : 2));
        const ledge = supportVertices.length / 3;
        supportVertices.push(innerX, top - 0.03, z0, x, top - 0.03, z0, innerX, top - 0.03, z1, x, top - 0.03, z1);
        supportIndices.push(ledge, ledge + (sign > 0 ? 2 : 1), ledge + (sign > 0 ? 1 : 2), ledge + 1, ledge + (sign > 0 ? 2 : 3), ledge + (sign > 0 ? 3 : 2));
        const shoulderX = step.position.x + sign * (step.size.x / 2 + 0.10 + random() * 0.17);
        if (random() > 0.40) put('fracture-1', shoulderX, top - 0.12, step.position.z, 0.20 + random() * 0.20, 0.16 + random() * 0.15, 0.22 + random() * 0.10, sign * Math.PI / 2);
        if (random() > 0.81 && Math.sin(top * 2.1 + sign) > -0.3) {
          put('moss-island', shoulderX, top - 0.026, step.position.z, 0.095 + random() * 0.04, 0.12, 0.09 + random() * 0.035, 0, 0.78 + random() * 0.15);
          if (random() > 0.45) put('short', shoulderX, top - 0.025, step.position.z, 0.24 + random() * 0.13, 0.29, 0.27);
        }
      }
    }
    const supportGeometry = new BufferGeometry();
    supportGeometry.setAttribute('position', new Float32BufferAttribute(supportVertices, 3)); supportGeometry.setIndex(supportIndices); supportGeometry.computeVertexNormals(); applyLandscapeUV(supportGeometry, 'cliff');
    const support = new Mesh(supportGeometry, landscape.stone); support.name = `stairs.${run}.aged-side-core`; support.castShadow = true; support.receiveShadow = true; group.add(support);
    for (const step of [steps[0]!, steps.at(-1)!]) for (const sign of [-1, 1]) {
      const top = step.position.y + step.size.y / 2;
      const x = step.position.x + sign * (step.size.x / 2 + 0.48), z = step.position.z;
      const y = groundHeight(x, z);
      if (Math.abs(y - top) < 0.4) {
        put('soil-island', x, y + 0.011, z, 0.6 + random() * 0.4, 1, 0.6 + random() * 0.25);
        put('fern', x, y, z + 0.15, 0.44 + random() * 0.23);
        put('fracture-0', x, y + 0.17, z - 0.20, 0.42, 0.18, 0.34);
      }
    }
  }

  const soilLipVertices: number[] = [], soilLipColors: number[] = [], soilLipIndices: number[] = [];
  const creviceRandom = randomSequence(RURAL.seed + 27431);
  const stairOpening = (x: number, z: number) => Math.abs(x + 7) < 2.35 && z > 2 && z < 11.5 || Math.abs(x + 14) < 2.05 && z > -21 && z < -12;
  // Soil hangs beneath the real grass edge, then breaks into asymmetrical bedrock and lower scree.
  for (const surface of surfaces.filter(item => item.id.endsWith('.cliff'))) {
    for (let edge = 0; edge < surface.vertices.length; edge += 12) {
      const ax = surface.vertices[edge]!, top = surface.vertices[edge + 1]!, az = surface.vertices[edge + 2]!;
      const bx = surface.vertices[edge + 3]!, bz = surface.vertices[edge + 5]!, bottom = surface.vertices[edge + 7]!;
      const length = Math.hypot(bx - ax, bz - az);
      const nx = (bz - az) / length, nz = -(bx - ax) / length;
      const faceRocks: { distance: number; y: number; width: number; halfHeight: number }[] = [];
      if (Math.max(Math.abs(ax), Math.abs(bx)) > 47.9 && Math.abs(ax - bx) < 0.01) continue;
      if (az < -44 && bz < -44 || az > 43 && bz > 43) continue;
      if (top > 0) {
        const sections = Math.ceil(length / 0.8);
        for (let section = 0; section < sections; section++) {
          const d0 = section / sections * length, d1 = (section + 1) / sections * length;
          const mx = ax + (bx - ax) * (d0 + d1) / (2 * length), mz = az + (bz - az) * (d0 + d1) / (2 * length);
          if (stairOpening(mx, mz) || groundHeight(mx + nx * 0.5, mz + nz * 0.5) >= top - 0.1) continue;
          if (Math.sin(mx * 0.44 + mz * 0.27) + Math.cos(mx * 0.79 - mz * 0.51) < -0.84) continue;
          const k = soilLipVertices.length / 3;
          for (const d of [d0, d1]) {
            const x = ax + (bx - ax) * d / length, z = az + (bz - az) * d / length;
            const depth = 0.12 + 0.40 * (0.5 + 0.5 * Math.sin(x * 0.61 + z * 0.38)) * (0.5 + 0.5 * Math.cos(x * 1.03 - z * 0.57));
            const topInset = 0.018 + (0.5 + 0.5 * Math.sin(x * 0.96 - z * 0.48)) * 0.043;
            soilLipVertices.push(x + nx * 0.06, top - topInset, z + nz * 0.06,
              x + nx * 0.105, top - depth * 0.48 - topInset, z + nz * 0.105,
              x + nx * 0.04, top - depth - topInset, z + nz * 0.04);
            const moss = Math.max(0, Math.sin(x * 0.83 + z * 0.48) * Math.cos(z * 0.67 - x * 0.23));
            for (const [ring, hex] of [0x717949, 0x857858, 0x7b7c61].entries()) {
              const color = new Color(hex).lerp(new Color(0x687842), moss * (ring === 0 ? 0.70 : ring === 1 ? 0.48 : 0.20));
              color.multiplyScalar(0.94 + Math.sin(x * 0.52 + z * 0.71 + ring) * 0.075); soilLipColors.push(color.r, color.g, color.b);
            }
          }
          soilLipIndices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
          if (random() > 0.75) put('crevice-trailer', mx + nx * 0.13, top - 0.05 - random() * 0.11, mz + nz * 0.13, 0.56 + random() * 0.34, 0.45 + random() * 0.7, 0.53 + random() * 0.28, Math.atan2(nx, nz), 0.86 + random() * 0.13);
        }
      }
      let stride = 1.8;
      for (let distance = 0.4; distance < length; distance += stride) {
        stride = 1.7 + random() * 1.7;
        const t = distance / length, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const outsideHeight = groundHeight(x + nx * 0.7, z + nz * 0.7);
        if (outsideHeight >= top - 0.05 || top < -0.1) continue;
        const exposedBottom = Math.max(bottom, outsideHeight, top === 0 ? -1.35 : -4);
        if (stairOpening(x, z)) continue;
        if (top === 0 && Math.abs(x - RURAL.bridge.x) < 2.4) continue;
        if (top === 0) continue; // Bank dressing uses its actual sloping shore and clustered communities below.
        const relief = top - exposedBottom;
        if (relief > 1.5) {
          const broadBedrock = random() > 0.76 && length - distance > 3;
          if (broadBedrock) stride = 3.8 + random() * 2.3;
          const divisions = broadBedrock ? [0, 0.64 + random() * 0.18, 1]
            : random() > 0.5 ? [0, 0.29 + random() * 0.12, 0.63 + random() * 0.14, 1] : [0, 0.36 + random() * 0.20, 1];
          for (let layer = 0; layer < divisions.length - 1; layer++) {
            const layerBottom = exposedBottom + relief * divisions[layer]!;
            const layerTop = exposedBottom + relief * divisions[layer + 1]! - (layer === divisions.length - 2 ? 0.25 + random() * 0.16 : 0);
            const height = layerTop - layerBottom;
            const along = (random() - 0.5) * (broadBedrock ? 0.5 : 0.9);
            const px = x + (bx - ax) / length * along, pz = z + (bz - az) / length * along;
            const width = broadBedrock ? stride * (layer === 0 ? 0.78 : 0.56) : 0.65 + random() * 1.08;
            const projection = layer === 0 ? 0.25 + random() * 0.14 : 0.04 + random() * 0.12 - layer * 0.025;
            const rockHalfHeight = height * (0.48 + random() * 0.05);
            put((layer + edge) % 2 ? 'fracture-0' : 'fracture-1', px + nx * projection,
              (layerTop + layerBottom) / 2, pz + nz * projection, width, rockHalfHeight,
              0.48 + random() * 0.36, Math.atan2(nx, nz));
            faceRocks.push({ distance: distance + along, y: (layerTop + layerBottom) / 2, width, halfHeight: rockHalfHeight });
            if (layer < divisions.length - 2 && random() > 0.40) {
              put('moss', px + nx * 0.37, layerTop - 0.065, pz + nz * 0.37,
                Math.min(1.3, width * 0.77), 0.32, 0.48 + random() * 0.22);
              if (random() > 0.58) put('fern', px + nx * 0.34, layerTop - 0.13, pz + nz * 0.34, 0.24 + random() * 0.21);
              if (random() > 0.65) put('weed', px + nx * 0.29, layerTop - 0.08, pz + nz * 0.29, 0.28, 0.40, 0.28);
            }
          }
          for (let scree = 0; scree < 2 + Math.floor(random() * 4); scree++) {
            const along = (random() - 0.5) * 1.8, out = 0.38 + random() * 0.85;
            const px = x + nx * out + (bx - ax) / length * along, pz = z + nz * out + (bz - az) / length * along;
            const floor = groundHeight(px, pz);
            if (floor >= top - 0.5 || reserved(px, pz, floor, 0.12)) continue;
            const size = 0.21 + random() * 0.43;
            put(scree % 2 ? 'fracture-1' : 'rock', px, floor + size * 0.25, pz, size, size * 0.37, size * (0.6 + random() * 0.5));
            if (scree === 0) { put('moss-island', px, floor + 0.008, pz, 0.5, 1, 0.35); put('fern', px, floor, pz, 0.35); }
          }
        } else {
          put('fracture-0', x + nx * 0.06, (exposedBottom + top) / 2, z + nz * 0.06,
            0.8 + random() * 0.4, relief * 0.48, 0.4 + random() * 0.3, Math.atan2(nx, nz));
          faceRocks.push({ distance, y: (exposedBottom + top) / 2, width: 1.0, halfHeight: relief * 0.48 });
        }
        const lipX = x - nx * 0.4, lipZ = z - nz * 0.4;
        if (Math.abs(groundHeight(lipX, lipZ) - top) < 0.08 && !reserved(lipX, lipZ, top, 0.25)) {
          put('moss-island', lipX, top + 0.008, lipZ, 0.6 + random() * 0.70, 1, 0.3 + random() * 0.4);
          const plantPatch = Math.sin(x * 0.48 + z * 0.23) + Math.cos(z * 0.56 - x * 0.15);
          if (plantPatch > -0.4) for (let plant = 0; plant < 3 + Math.floor(random() * 4); plant++) {
            const along = (random() - 0.5) * 1.45, inset = 0.16 + random() * 0.58;
            const px = lipX - nx * inset + (bx - ax) / length * along, pz = lipZ - nz * inset + (bz - az) / length * along;
            if (Math.abs(groundHeight(px, pz) - top) > 0.08 || reserved(px, pz, top, 0.12)) continue;
            put(plant % 3 === 0 ? 'fern' : plant % 3 === 1 ? 'weed' : 'tall', px, top, pz, 0.35 + random() * 0.37);
          }
        }
      }
      if (top > 0) {
        // Fill only exposed interstices between the retained outcrops; no new course/grid of rock modules.
        const averageFloor = groundHeight((ax + bx) / 2 + nx * 0.55, (az + bz) / 2 + nz * 0.55);
        const faceHeight = top - Math.max(bottom, averageFloor);
        const candidates = Math.ceil(length * Math.max(0, faceHeight) * 0.95);
        for (let gap = 0; gap < candidates; gap++) {
          const distance = (0.04 + creviceRandom() * 0.92) * length;
          const x = ax + (bx - ax) * distance / length, z = az + (bz - az) * distance / length;
          const floor = Math.max(bottom, groundHeight(x + nx * 0.55, z + nz * 0.55));
          if (floor >= top - 0.8 || stairOpening(x, z)) continue;
          let y = floor + 0.22 + creviceRandom() * Math.max(0, top - floor - 0.65);
          const covered = faceRocks.some(rock => Math.pow((distance - rock.distance) / (rock.width * 0.95), 2) + Math.pow((y - rock.y) / (rock.halfHeight * 0.88), 2) < 1);
          if (covered) continue;
          const width = 0.22 + creviceRandom() * 0.57, halfHeight = 0.20 + creviceRandom() * 0.40;
          y = Math.min(y, top - 0.13 - (width * 0.40 + halfHeight * 0.96));
          if (Math.abs(x + 7) < 2.35 + width && z > 2 && z < 11.5 || Math.abs(x + 14) < 2.05 + width && z > -21 && z < -12) continue;
          const relief = 0.16 + creviceRandom() * 0.22;
          put(gap % 3 ? 'fracture-chip' : 'fracture-slate', x + nx * 0.035, y, z + nz * 0.035,
            width, halfHeight, relief, Math.atan2(nx, nz), 0.82 + creviceRandom() * 0.20);
          faceRocks.push({ distance, y, width, halfHeight });
          if (creviceRandom() > 0.48) {
            const side = creviceRandom() > 0.5 ? 1 : -1;
            const along = side * width * 0.76;
            const px = x + (bx - ax) / length * along + nx * 0.022, pz = z + (bz - az) / length * along + nz * 0.022;
            const streakHeight = Math.min(0.30 + creviceRandom() * 0.48, (top - y - halfHeight * 0.18 - 0.08) / 0.85);
            put('cliff-soil-streak', px, y + halfHeight * 0.18, pz, 0.10 + creviceRandom() * 0.14,
              streakHeight, 0.20, Math.atan2(nx, nz), 0.87 + creviceRandom() * 0.10);
            if (creviceRandom() > 0.40) put('crevice-trailer', px + nx * 0.048, y + halfHeight * 0.38, pz + nz * 0.048,
              0.34 + creviceRandom() * 0.29, 0.42 + creviceRandom() * 0.53, 0.40,
              Math.atan2(nx, nz), 0.84 + creviceRandom() * 0.13);
          }
        }
      }
    }
  }

  const soilLipGeometry = new BufferGeometry();
  soilLipGeometry.setAttribute('position', new Float32BufferAttribute(soilLipVertices, 3)); soilLipGeometry.setAttribute('color', new Float32BufferAttribute(soilLipColors, 3)); soilLipGeometry.setIndex(soilLipIndices); soilLipGeometry.computeVertexNormals(); applyLandscapeUV(soilLipGeometry, 'cliff');
  const soilLipMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 }); soilLipMaterial.name = 'landscape.layered-soil-lip';
  const soilLips = new Mesh(soilLipGeometry, soilLipMaterial); soilLips.name = 'terrain.layered-soil-lips'; soilLips.receiveShadow = true; group.add(soilLips);

  const shores = ground.filter(surface => surface.id.includes('north-bank') || surface.id.includes('south-bank'));
  const bankVertices: number[] = [], bankColors: number[] = [], bankIndices: number[] = [];
  const shoreHeight = (offset: number) => offset < 0 ? 0 : offset < 0.55 ? -0.04 - offset / 0.55 * 0.36 : -0.40 - (offset - 0.55) / 0.95 * 1.12;
  const bankBands = [-0.14, 0.08, 0.30, 0.55, 0.85, 1.13, 1.52];
  for (const shore of shores) for (let edge = 0; edge < shore.vertices.length; edge += 3) {
    const next = (edge + 3) % shore.vertices.length;
    const ax = shore.vertices[edge]!, az = shore.vertices[edge + 2]!, bx = shore.vertices[next]!, bz = shore.vertices[next + 2]!;
    if (Math.abs(ax) > 47.9 && Math.abs(bx) > 47.9 || az < 0 || bz < 0 || az > 30 || bz > 30) continue;
    const length = Math.hypot(bx - ax, bz - az), nx = (bz - az) / length, nz = -(bx - ax) / length;
    const previous = (edge - 3 + shore.vertices.length) % shore.vertices.length;
    const previousX = shore.vertices[previous]!, previousZ = shore.vertices[previous + 2]!;
    const previousLength = Math.hypot(ax - previousX, az - previousZ);
    const previousNX = (az - previousZ) / previousLength, previousNZ = -(ax - previousX) / previousLength;
    // Small deposited stone/plant pockets soften local bends in the authored shoreline polygon.
    if (Math.abs(nx - previousNX) + Math.abs(nz - previousNZ) > 0.25 && previousZ > 0 && previousZ < 30 && Math.abs(ax - RURAL.bridge.x) > 2.8) {
      const normalLength = Math.hypot(nx + previousNX, nz + previousNZ);
      const cornerNX = (nx + previousNX) / normalLength, cornerNZ = (nz + previousNZ) / normalLength;
      for (let deposit = 0; deposit < 2 + Math.floor(creviceRandom() * 3); deposit++) {
        const offset = 0.22 + creviceRandom() * 0.73, along = (creviceRandom() - 0.5) * 1.04, size = 0.29 + creviceRandom() * 0.39;
        const x = ax + cornerNX * offset + cornerNZ * along, z = az + cornerNZ * offset - cornerNX * along;
        put(deposit % 2 ? 'fracture-chip' : 'rock', x, shoreHeight(offset) + size * 0.16, z,
          size, size * (0.31 + creviceRandom() * 0.16), size * (0.5 + creviceRandom() * 0.35), creviceRandom() * Math.PI * 2, 0.82 + creviceRandom() * 0.15);
        if (deposit < 2) put('reed', x + cornerNX * 0.14, shoreHeight(offset + 0.14) + 0.012, z + cornerNZ * 0.14,
          0.45 + creviceRandom() * 0.28, 0.5 + creviceRandom() * 0.32, 0.47, creviceRandom() * Math.PI * 2, 0.88);
      }
      const inlandX = ax - cornerNX * 0.34, inlandZ = az - cornerNZ * 0.34;
      if (groundHeight(inlandX, inlandZ) === 0 && !reserved(inlandX, inlandZ, 0, 0.2)) {
        put('ecology-groundcover', inlandX, 0.008, inlandZ, 0.53, 0.46, 0.54, creviceRandom() * Math.PI * 2, 0.88);
        put('short', inlandX - cornerNX * 0.19, 0.008, inlandZ - cornerNZ * 0.19, 0.57, 0.60, 0.53, creviceRandom() * Math.PI * 2, 0.88);
      }
    }
    const sections = Math.ceil(length / 0.8);
    for (let section = 0; section <= sections; section++) {
      const d = section / sections * length, x = ax + (bx - ax) * d / length, z = az + (bz - az) * d / length;
      for (const [band, basis] of bankBands.entries()) {
        const variation = Math.sin(x * 0.63 + z * 0.46 + band * 1.37) * (band === 0 ? 0.095 : band === 3 ? 0 : 0.055);
        const offset = basis + variation;
        bankVertices.push(x + nx * offset, shoreHeight(offset) + (offset < 0 ? 0.008 : 0.010), z + nz * offset);
        const depth = Math.max(0, Math.min(1, (offset + 0.02) / 1.27));
        const mix = depth * depth * (3 - 2 * depth);
        const earth = new Color(0x75804a), shallows = new Color(0x638f76);
        const color = earth.lerp(shallows, mix).lerp(new Color(0x837950), Math.sin(depth * Math.PI) * 0.17);
        color.multiplyScalar(0.97 + Math.sin(x * 0.41 + z * 0.39 + depth) * 0.045); bankColors.push(color.r, color.g, color.b);
      }
      if (section > 0) for (let band = 0; band < bankBands.length - 1; band++) {
        const k = bankVertices.length / 3 - bankBands.length + band;
        bankIndices.push(k - bankBands.length, k, k - bankBands.length + 1, k - bankBands.length + 1, k, k + 1);
      }
    }
    for (let distance = 0.8 + random() * 2; distance < length; distance += 2.5 + random() * 4.8) {
      const x = ax + (bx - ax) * distance / length, z = az + (bz - az) * distance / length;
      if (Math.abs(x - RURAL.bridge.x) < 2.7 || Math.sin(x * 0.32 + z * 0.42) < -0.68) continue;
      const reeds = 4 + Math.floor(random() * 12), patchWidth = 0.6 + random() * 1.5;
      for (let plant = 0; plant < reeds; plant++) {
        const along = (random() - 0.5) * patchWidth * 2;
        const offset = 0.22 + random() * (plant % 4 === 0 ? 1.05 : 0.58);
        const px = x + nx * offset + (bx - ax) / length * along, pz = z + nz * offset + (bz - az) / length * along;
        put('reed', px, shoreHeight(offset) + 0.025, pz, 0.44 + random() * 0.74, 0.46 + random() * 0.67, 0.50 + random() * 0.68);
        if (plant < 5) {
          const inset = 0.3 + random() * 0.55, lx = x - nx * inset + (bx - ax) / length * along, lz = z - nz * inset + (bz - az) / length * along;
          if (groundHeight(lx, lz) === 0 && !reserved(lx, lz, 0, 0.16)) {
            put(plant % 3 === 0 ? 'fern' : plant % 3 === 1 ? 'ecology-groundcover' : 'short', lx, 0.008, lz, 0.44 + random() * 0.36);
            if (plant === 0) put('moss-island', lx, 0.004, lz, 0.35 + random() * 0.25, 0.12, 0.23 + random() * 0.18, random() * Math.PI * 2, 0.8);
          }
        }
      }
      if (random() > 0.24) for (let stone = 0; stone < 2 + Math.floor(random() * 4); stone++) {
        const along = (random() - 0.5) * patchWidth * 2.3, offset = 0.12 + random() * 0.94;
        const size = 0.32 + random() * 0.70;
        put(stone % 2 ? 'rock' : 'fracture-1', x + nx * offset + (bx - ax) / length * along,
          shoreHeight(offset) + size * 0.17, z + nz * offset + (bz - az) / length * along,
          size, size * (0.30 + random() * 0.22), size * (0.46 + random() * 0.46));
      }
    }
  }
  const bankGeometry = new BufferGeometry();
  bankGeometry.setAttribute('position', new Float32BufferAttribute(bankVertices, 3)); bankGeometry.setAttribute('color', new Float32BufferAttribute(bankColors, 3)); bankGeometry.setIndex(bankIndices); bankGeometry.computeVertexNormals();
  const banks = new Mesh(bankGeometry, new MeshStandardMaterial({ vertexColors: true, roughness: 1 })); banks.name = 'water.irregular-wet-bank-washes'; banks.receiveShadow = true; group.add(banks);

  // Stone shoulders support bridge corners and grass grows around, while both landing cores remain open.
  for (const z of [12, 26]) for (const sign of [-1, 1]) {
    const sideX = RURAL.bridge.x + sign * 2.12;
    put('fracture-0', sideX, -0.33, z, 0.64, 0.43, 0.82, z === 12 ? 0 : Math.PI, 0.78);
    put('rock', sideX + sign * 0.56, -0.19, z + (z === 12 ? -0.28 : 0.28), 0.38, 0.31, 0.48, 0, 0.87);
    const landZ = z + (z === 12 ? -0.57 : 0.57), landX = sideX + sign * 0.37;
    if (groundHeight(landX, landZ) === 0) {
      put('moss-island', landX, 0.011, landZ, 0.58, 1, 0.43); put('short', landX, 0, landZ, 0.64);
    }
  }

  const colored = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.96 });
  colored.name = 'rural.library.vertex-pigment';
  const transform = new Object3D();
  const instances: Record<string, number> = {};
  for (const [name, batch] of library) {
    const isStone = name.startsWith('fracture-') || name.startsWith('step-stone-') || name === 'rock' || name === 'small-stone';
    if (isStone) {
      applyLandscapeUV(batch.geometry, 'cliff');
      const uv = batch.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 7);
    }
    const mesh = new InstancedMesh(batch.geometry, isStone ? landscape.stone : colored, batch.positions.length);
    mesh.name = `rural.instances.${name}`; mesh.castShadow = batch.shadows; mesh.receiveShadow = true;
    for (const [i, p] of batch.positions.entries()) {
      transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, p.yaw, 0); transform.scale.set(p.sx, p.sy, p.sz); transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, new Color(p.tint, p.tint, p.tint));
    }
    mesh.computeBoundingSphere(); group.add(mesh); instances[name] = batch.positions.length;
  }

  const waterGeometry = new PlaneGeometry(96, 29, 96, 29);
  waterGeometry.rotateX(-Math.PI / 2); waterGeometry.translate(0, -1.16, 18.5);
  const waterPositions = waterGeometry.getAttribute('position');
  const waterColors: number[] = [];
  const shallow = new Color(0x638f76), deep = new Color(0x247e80);
  function bankDistance(x: number, z: number) {
    let nearest = 30;
    for (const shore of shores) for (let i = 0; i < shore.vertices.length; i += 3) {
      const next = (i + 3) % shore.vertices.length;
      const ax = shore.vertices[i]!, az = shore.vertices[i + 2]!, bx = shore.vertices[next]!, bz = shore.vertices[next + 2]!;
      if (az < 0 || az > 31 || bz < 0 || bz > 31) continue;
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      nearest = Math.min(nearest, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return nearest;
  }
  for (let i = 0; i < waterPositions.count; i++) {
    const z = waterPositions.getZ(i), x = waterPositions.getX(i);
    const edgeDepth = bankDistance(x, z) + Math.sin(x * 0.53 + z * 0.74) * 0.22 + Math.sin(x * 0.22 - z * 1.7) * 0.15;
    const mix = Math.max(0, Math.min(1, (edgeDepth - 0.6) / 3.9));
    const color = shallow.clone().lerp(deep, mix);
    color.multiplyScalar((0.94 + 0.105 * Math.sin(x * 0.27 + Math.sin(z * 0.55)) * Math.sin(z * 0.43 + x * 0.18)) * (1 - Math.exp(-edgeDepth * 1.5) * 0.13));
    waterColors.push(color.r, color.g, color.b);
  }
  waterGeometry.setAttribute('color', new Float32BufferAttribute(waterColors, 3));
  const water = new Mesh(waterGeometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.29, metalness: 0.08 }));
  water.name = 'water.turquoise-current'; water.receiveShadow = true; group.add(water);
  const crestGeometry = new BufferGeometry();
  crestGeometry.setAttribute('position', new Float32BufferAttribute([-0.6, 0, 0, -0.15, 0, -0.068, 0.5, 0, -0.025, 0.6, 0, 0, 0.1, 0, 0.056, -0.4, 0, 0.036], 3));
  crestGeometry.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]); crestGeometry.computeVertexNormals();
  const crests = new InstancedMesh(crestGeometry, new MeshStandardMaterial({ color: 0x46978f, roughness: 0.45 }), 240);
  crests.name = 'water.moving-current-highlights';
  const crestStates = Array.from({ length: crests.count }, (_, i) => {
    const x = -45 + random() * 90, z = 9 + random() * 18;
    const tint = i % 9 === 0 ? 1.0 : 0.81 + random() * 0.14;
    crests.setColorAt(i, new Color(tint, tint, tint));
    return { x, z, phase: random() * Math.PI * 2, size: 0.16 + random() * 0.44 };
  });
  crests.frustumCulled = false; group.add(crests);
  group.userData.environment = {
    generator: 'src/render/rural.ts', seed: RURAL.seed, meters: true,
    library: ['authored branching tree families', 'varied shrub families', 'fern', 'short grass', 'tall grass', 'cattail reed', 'white flower', 'yellow flower', 'weed', 'wheat', 'fractured bedrock', 'worn beveled stair stones', 'soil and moss islands'],
    instances, totalInstances: Object.values(instances).reduce((a, b) => a + b, 0) + crests.count,
    distribution: 'clustered ecological communities with clear path cores, worn unequal verges, supported cliff-lip/crevice growth and sloping bank reed/stone patches; agriculture in rows',
    collision: 'triangle terrain/shore shared with Rapier; separate trunk, fence, raised bed and hero-architecture proxies; small plants/rock veneers noncolliding',
    water: 'opaque depth-colored surface with irregular wet-bank bands, clustered bank plants and corner footings; deterministic shallow geometry waves/current highlights; no simulation or screen-space effect',
    sourceImagesSampled: false,
  };
  let waterResponse = 1;
  const waterHeight = (x: number, z: number, elapsed: number) =>
    -1.16 + (Math.sin(x * 0.65 + z * 1.6 + elapsed * 0.85) * 0.023 + Math.sin(x * 1.9 - z * 0.5 - elapsed * 0.55) * 0.009) * waterResponse;
  function update(elapsed: number, wind = 0.25, rain = 0) {
    waterResponse = 1 + Math.max(0, wind - 0.25) * 0.35 + rain * 0.4;
    for (let i = 0; i < waterPositions.count; i++) {
      const x = waterPositions.getX(i), z = waterPositions.getZ(i);
      waterPositions.setY(i, waterHeight(x, z, elapsed));
    }
    waterPositions.needsUpdate = true;
    waterGeometry.computeVertexNormals();
    for (const [i, crest] of crestStates.entries()) {
      const x = crest.x + Math.sin(elapsed * 0.11 + crest.phase) * 0.7, z = crest.z + Math.sin(elapsed * 0.15 + crest.phase) * 0.08;
      transform.position.set(x, waterHeight(x, z, elapsed) + 0.016, z);
      transform.rotation.set(0, 0.16 + Math.sin(crest.phase) * 0.40, 0);
      transform.scale.set(crest.size * (1 + Math.sin(elapsed * 0.45 + crest.phase) * 0.18), 1, 0.5 + crest.size * 0.5);
      transform.updateMatrix(); crests.setMatrixAt(i, transform.matrix);
    }
    crests.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update };
}
