import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry,
  Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Mesh,
  MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RURAL } from '../simulation/rural-layout';
import { RURAL_FENCES, RURAL_TREES } from '../simulation/rural';
import type { CourseSpec } from '../simulation/types';
import { applyLandscapeUV, createLandscapeMaterials } from './landscape-materials';

type PathPoint = readonly [number, number];
type Lane = { points: PathPoint[]; width: number; y: number; name: string };

const LANES: Lane[] = [
  { points: [[-28, -48], [-25, -39], [-27, -31], [-25, -23], [-20, -17], [-16, -10], [-17, -5], [-17, -1], [-15, 2.4], [-12, 3.2], [-9.5, 1.6], [-7, 1.2], [-7, 3]], width: 3.4, y: 4.028, name: 'main-cottage' },
  { points: [[-7, 10.2], [-6.7, 11], [-4.5, 10.5], [RURAL.bridge.x, 10.5], [RURAL.bridge.x, 12]], width: 3.0, y: 0.028, name: 'bank-bridge' },
  { points: [[RURAL.bridge.x, 26], [RURAL.bridge.x, 28], [5, 31], [9, 35], [8, 40], [3, 45], [2, 48]], width: 3.8, y: 0.03, name: 'south' },
  { points: [[-14, 1], [-8, -0.5], [-3, -1.8], [1, -1.4], [4, 1.1], [6.5, 3], [10, 3], [10, 1.6]], width: 2.35, y: 4.037, name: 'cottage-door-garden' },
  { points: [[-19, -14], [-16.5, -13.2], [-14, -13.3], [-14, -14.3]], width: 2.8, y: 4.032, name: 'crop-approach' },
  { points: [[-14, -20.3], [-14, -23], [-9, -24], [-5, -25], [2, -25]], width: 2.8, y: 7.428, name: 'crop-upper' },
];

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

function sampledLane(points: readonly PathPoint[]) {
  return new CatmullRomCurve3(points.map(point => new Vector3(point[0], 0, point[1])), false, 'catmullrom', 0.25)
    .getPoints(points.length * 14).map(point => [point.x, point.z] as const);
}

/** Wide authored ribbon, with softened bends and no terrain tile grid. */
function pathMesh(points: readonly PathPoint[], width: number, y: number, material: MeshStandardMaterial, name: string) {
  const samples = sampledLane(points);
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const a = samples[Math.max(0, i - 1)]!;
    const b = samples[Math.min(samples.length - 1, i + 1)]!;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const edge = width * (0.5 + 0.028 * Math.sin(i * 0.83) + 0.018 * Math.sin(i * 1.61));
    const ox = dz / length * edge, oz = -dx / length * edge;
    vertices.push(p[0] + ox, y, p[1] + oz, p[0] - ox, y, p[1] - oz);
    if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); }
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

function pigment(source: BufferGeometry, hex: number, variation = 0.1) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.deleteAttribute('uv');
  const position = geometry.getAttribute('position');
  const base = new Color(hex);
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const value = 1 + variation * Math.sin(position.getX(i) * 7.3 + position.getY(i) * 11.9 + position.getZ(i) * 4.7);
    colors.push(base.r * value, base.g * value, base.b * value);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function combined(parts: BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error('Rural geometry library failed to merge.');
  for (const part of parts) part.dispose();
  return geometry;
}

function branch(a: Vector3, b: Vector3, bottom: number, top: number, color: number, sides = 7) {
  const direction = b.clone().sub(a);
  const geometry = new CylinderGeometry(top, bottom, direction.length(), sides, 1);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const result = pigment(geometry, color, 0.13);
  geometry.dispose();
  return result;
}

/** A thick creased leaf: a small solid blade with six faces, never a billboard. */
function blade(height: number, width: number, bend: number, color: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, 0, 0, -width / 2, height * 0.47, bend * 0.35, 0, height, bend,
    width / 2, height * 0.47, bend * 0.35, 0, height * 0.47, bend * 0.35 + width * 0.20,
    0, height * 0.47, bend * 0.35 - width * 0.09,
  ], 3));
  geometry.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 5, 1, 1, 5, 2, 2, 5, 3, 3, 5, 0]);
  geometry.computeVertexNormals();
  return pigment(geometry, color, 0.18);
}

function lobe(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, detail = 1, smooth = false) {
  const geometry = new IcosahedronGeometry(1, detail);
  const positions = geometry.getAttribute('position');
  const normals: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i);
    const irregularity = 1 + 0.10 * Math.sin(px * 7 + py * 3) * Math.cos(pz * 9 - py * 4);
    positions.setXYZ(i, x + px * sx * irregularity, y + py * sy * irregularity, z + pz * sz * irregularity);
    const normal = new Vector3(px / sx, py / sy, pz / sz).normalize();
    normals.push(normal.x, normal.y, normal.z);
  }
  if (smooth) geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  const result = pigment(geometry, color, 0.14);
  geometry.dispose();
  return result;
}

function treeGeometry(species: number) {
  const random = randomSequence(783 + species * 351);
  const parts: BufferGeometry[] = [];
  const height = species === 1 ? 9.3 : species === 2 ? 6.5 : 7.8;
  const lean = species === 2 ? 0.65 : 0.18;
  const trunkTop = new Vector3(lean, height * 0.61, 0.12);
  parts.push(branch(new Vector3(0, 0, 0), new Vector3(0.11, 2.4, -0.05), 0.37, 0.24, 0x63503a));
  parts.push(branch(new Vector3(0.11, 2.4, -0.05), trunkTop, 0.24, 0.10, 0x68543b));
  for (let root = 0; root < 5; root++) {
    const angle = root * Math.PI * 2 / 5 + 0.3;
    parts.push(branch(new Vector3(Math.cos(angle) * 0.72, 0.035, Math.sin(angle) * 0.72), new Vector3(0, 0.7, 0), 0.12, 0.16, 0x655139));
  }
  const crowns = species === 1 ? 9 : 10;
  const colors = [0x40582b, 0x4c632d, 0x5f7235, 0x6d7c3b, 0x50652d];
  for (let i = 0; i < crowns; i++) {
    const angle = i * 2.399 + random() * 0.25;
    const width = species === 1 ? 1.35 : species === 2 ? 2.65 : 2.0;
    const distance = (0.6 + random() * 0.6) * width;
    const cy = species === 1 ? height * (0.50 + i / crowns * 0.39) : height * (0.56 + 0.25 * random());
    const target = new Vector3(lean + Math.cos(angle) * distance, cy, Math.sin(angle) * distance);
    const from = new Vector3(0.05, 2.4 + i % 3 * 0.5, 0);
    parts.push(branch(from, target, 0.13, 0.045, i % 2 ? 0x725a3e : 0x5e4c36));
    const sx = species === 1 ? 1.10 - i / crowns * 0.30 : species === 2 ? 1.65 : 1.45;
    const sy = species === 1 ? 1.65 : species === 2 ? 0.95 : 1.18;
    parts.push(lobe(target.x, target.y, target.z, sx * 0.57, sy * 0.62, sx * 0.57, 0x354f29, 1, true));
    // Overlapping small solid leaf bunches conceal the core. No fine blade spikes.
    const sprays = species === 1 ? 98 : 84;
    for (let spray = 0; spray < sprays; spray++) {
      const a = spray * 2.399963 + (random() - 0.5) * 0.45;
      const vertical = 0.985 - (spray + 0.5) / sprays * 1.97;
      const ring = Math.sqrt(1 - vertical * vertical);
      const direction = new Vector3(Math.cos(a) * ring, vertical, Math.sin(a) * ring);
      const size = 0.25 + random() * 0.15;
      const color = vertical > 0.25 ? [0x647a39, 0x748340, 0x5d7537][spray % 3]!
        : vertical < -0.25 ? [0x3d592c, 0x49622e, 0x506c31][spray % 3]! : colors[(i + spray) % colors.length]!;
      const radius = 0.81 + random() * 0.08;
      parts.push(lobe(target.x + direction.x * sx * radius, target.y + direction.y * sy * radius,
        target.z + direction.z * sx * radius, size * 1.08, size * (0.68 + random() * 0.34), size,
        color, 1, true));
    }
  }
  return combined(parts);
}

function shrubGeometry() {
  const random = randomSequence(17131);
  const parts = [lobe(0, 0.35, 0, 0.45, 0.27, 0.40, 0x38552b, 1, true)];
  for (let i = 0; i < 56; i++) {
    const azimuth = i * 2.399963, vertical = 0.98 - i / 56 * 1.64;
    const ring = Math.sqrt(1 - vertical * vertical), size = 0.15 + random() * 0.10;
    parts.push(lobe(Math.cos(azimuth) * ring * 0.68, 0.42 + vertical * 0.39, Math.sin(azimuth) * ring * 0.61,
      size * 1.15, size * 0.80, size, vertical > 0.3 ? 0x73813e : i % 2 ? 0x526a30 : 0x607634, 0, true));
  }
  return combined(parts);
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

function fernGeometry() {
  const parts: BufferGeometry[] = [];
  for (let frond = 0; frond < 7; frond++) {
    const angle = frond * 2.399;
    const length = 0.65 + frond % 3 * 0.13;
    for (let leaflet = 0; leaflet < 7; leaflet++) {
      const t = (leaflet + 1) / 8, radius = t * length;
      for (const sign of [-1, 1]) {
        const leaf = blade(0.23 * (1 - t * 0.65), 0.09 * (1 - t * 0.55), 0.025, frond % 2 ? 0x647b39 : 0x466431);
        leaf.rotateZ(sign * -Math.PI / 2.8); leaf.rotateY(angle); leaf.translate(Math.sin(angle) * radius, Math.sin(t * Math.PI * 0.8) * length * 0.65, Math.cos(angle) * radius);
        parts.push(leaf);
      }
    }
  }
  return combined(parts);
}

function plantGeometry(kind: 'short' | 'tall' | 'reed' | 'wheat' | 'white' | 'yellow' | 'weed') {
  const parts: BufferGeometry[] = [];
  const random = randomSequence(kind.charCodeAt(0) * 8191 + kind.length * 131);
  if (kind === 'white' || kind === 'yellow') {
    for (let stalk = 0; stalk < 3; stalk++) {
      const x = (random() - 0.5) * 0.26, z = (random() - 0.5) * 0.26, h = 0.30 + random() * 0.25;
      parts.push(branch(new Vector3(x, 0, z), new Vector3(x + 0.03, h, z), 0.009, 0.005, 0x52692d, 4));
      for (let petal = 0; petal < 6; petal++) {
        const leaf = blade(0.10, 0.075, 0.015, kind === 'white' ? 0xe5dfbd : 0xd5b449);
        leaf.rotateZ(-Math.PI / 2); leaf.rotateY(petal * Math.PI / 3); leaf.translate(x + 0.03, h, z);
        parts.push(leaf);
      }
      parts.push(lobe(x + 0.03, h + 0.016, z, 0.033, 0.028, 0.033, 0xc39734, 0));
      const leaf = blade(0.20, 0.052, 0.11, 0x536b30); leaf.rotateY(stalk * 2); leaf.translate(x, 0.04, z); parts.push(leaf);
    }
  } else if (kind === 'reed' || kind === 'wheat') {
    for (let stalk = 0; stalk < (kind === 'reed' ? 4 : 3); stalk++) {
      const x = (random() - 0.5) * 0.27, z = (random() - 0.5) * 0.27;
      const h = kind === 'reed' ? 1.2 + random() * 0.55 : 0.88 + random() * 0.27;
      const lean = 0.035 + random() * 0.08;
      const stem = kind === 'reed' ? 0x67764a : 0xb8a14e;
      parts.push(branch(new Vector3(x, 0, z), new Vector3(x + lean, h, z), 0.012, 0.007, stem, 4));
      for (let leafIndex = 0; leafIndex < 2; leafIndex++) {
        const leaf = blade(kind === 'reed' ? 0.82 : 0.42, kind === 'reed' ? 0.085 : 0.046, 0.26, stem);
        leaf.rotateY(stalk * 2.3 + leafIndex * 2.7); leaf.translate(x, h * (0.18 + leafIndex * 0.21), z); parts.push(leaf);
      }
      if (kind === 'wheat') {
        parts.push(lobe(x + lean, h + 0.09, z, 0.052, 0.17, 0.052, stalk % 2 ? 0xc4aa51 : 0xab9142, 1));
        for (let awn = 0; awn < 3; awn++) {
          const leaf = blade(0.21, 0.012, 0.06, 0xc8b266); leaf.rotateY(awn * 2.1); leaf.translate(x + lean, h + 0.1, z); parts.push(leaf);
        }
      } else if (stalk % 2 === 0) {
        parts.push(branch(new Vector3(x + lean, h - 0.03, z), new Vector3(x + lean, h + 0.16, z), 0.032, 0.027, 0x6b5738, 6));
      }
    }
  } else {
    const h = kind === 'short' ? 0.27 : kind === 'weed' ? 0.53 : 0.65;
    for (let i = 0; i < 7; i++) {
      const leaf = blade(h * (0.65 + random() * 0.65), kind === 'weed' ? 0.115 : 0.045, h * 0.28,
        [0x596f32, 0x748443, 0x627639, 0x85904b][i % 4]!);
      leaf.rotateY(i * 2.399); leaf.translate((random() - 0.5) * 0.21, 0, (random() - 0.5) * 0.21); parts.push(leaf);
    }
  }
  return combined(parts);
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
  function reserved(x: number, z: number, y: number, extra = 0) {
    if (Math.abs(x) > 46 || Math.abs(z) > 46 || y < -0.1) return true;
    if (Math.hypot(x - course.spawn.x, z - course.spawn.z) < 1.2 + extra) return true;
    if (pathDistance(x, z, y) < extra) return true;
    if (Math.abs(x) < 4.3 + extra && Math.abs(z + 7) < 3.9 + extra) return true;
    if (Math.abs(x + 10) < 2.1 + extra && Math.abs(z + 1) < 2.0 + extra) return true;
    if (x > 4.9 - extra && x < 15 + extra && z > -7 - extra && z < 2.7 + extra) return true;
    if (Math.abs(x - RURAL.wheat.x) < 9.5 && Math.abs(z - RURAL.wheat.z) < 5.9) return true;
    if (Math.abs(x + 7) < 2.3 + extra && z > 1.9 && z < 11.8) return true;
    if (Math.abs(x + 14) < 2.1 + extra && z > -21.1 && z < -12.4) return true;
    return false;
  }
  const library = new Map<string, Batch>();
  function register(name: string, geometry: BufferGeometry, shadows = false) { library.set(name, { geometry, shadows, positions: [] }); }
  function put(name: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, yaw = random() * Math.PI * 2, tint = 0.91 + random() * 0.18) {
    library.get(name)!.positions.push({ x, y, z, sx, sy, sz, yaw, tint });
  }
  for (let species = 0; species < 3; species++) register(`tree-${species}`, treeGeometry(species), true);
  for (const kind of ['short', 'tall', 'reed', 'wheat', 'white', 'yellow', 'weed'] as const) register(kind, plantGeometry(kind), kind === 'wheat');
  register('shrub', shrubGeometry(), true);
  register('fern', fernGeometry());
  register('rock', lobe(0, 0, 0, 1, 0.8, 0.75, 0x7d7c61), true);
  register('fracture-0', fracturedRockGeometry(0), true);
  register('fracture-1', fracturedRockGeometry(1), true);
  register('small-stone', lobe(0, 0.05, 0, 0.26, 0.13, 0.20, 0x989176), false);
  register('moss', lobe(0, 0, 0, 1, 0.13, 0.8, 0x667338), false);
  register('wood', pigment(new BoxGeometry(1, 1, 1), 0x715437, 0.15), true);
  register('edging', pigment(new BoxGeometry(1, 1, 1), 0x76684b, 0.13), true);

  for (const [index, [x, y, z, scale, species]] of RURAL_TREES.entries()) {
    put(`tree-${species}`, x, y, z, scale, scale, scale, index * 1.718, 0.92 + (index % 4) * 0.045);
  }

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

  // Authored ecological patches: paths, roots, ledges and a few open grass clearings.
  const patches: [number, number, number, number][] = [
    [-34, -15, 6, 4], [-27, -23, 4, 5], [-36, -31, 6, 6], [-22, -32, 3, 6],
    [-11, -30, 5, 4], [-3, -31, 5, 4], [2, -40, 6, 4], [30, -34, 5, 6],
    [29, -22, 4, 3], [34, -11, 7, 6], [20, -11, 4, 5], [15, -13, 3, 3],
    [-7, -14, 4, 2.4], [-8, -7, 1.8, 4], [-21, -6, 4, 6], [-29, -1, 6, 3],
    [-4, 1.1, 2.4, 1.4], [18, 1, 3.5, 3], [25, 3, 6, 2.5], [35, 2, 6, 2],
    [-19, 6, 5, 1.7], [-13, 9, 2, 1.2], [2, 7, 4, 1.3], [9, 6.6, 4, 1.5],
    [23, 7, 7, 1.4], [-28, 6, 7, 1], [-38, 6.2, 6, 1.8],
    [-22, 29.3, 5, 1.6], [-11, 30.7, 3, 2], [8, 29.7, 5, 1.8], [23, 29.5, 5, 2],
    [-20, 37, 8, 6], [-7, 42, 5, 5], [18, 39, 6, 7], [32, 37, 7, 6],
  ];
  for (const [patchIndex, [cx, cz, rx, rz]] of patches.entries()) {
    for (let plant = 0; plant < 450; plant++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (0.75 + random() * 0.3);
      const x = cx + Math.cos(angle) * radius * rx, z = cz + Math.sin(angle) * radius * rz;
      const y = groundHeight(x, z);
      if (reserved(x, z, y, 0.28)) continue;
      const patchNoise = Math.sin(x * 1.5 + Math.sin(z)) * Math.cos(z * 1.8);
      if (patchNoise < -0.45) continue;
      const kind = patchIndex % 4 === 0 && plant % 5 === 0 ? 'tall' : 'short';
      const scale = 0.7 + random() * 0.8;
      put(kind, x, y + 0.005, z, scale, scale, scale);
      if (plant % 19 === 0) put(patchIndex % 3 ? 'white' : 'yellow', x + 0.1, y, z, 0.72 + random() * 0.45);
      if (plant % 61 === 0 && pathDistance(x, z, y) > 0.7) put('weed', x, y, z, 0.8 + random() * 0.3);
    }
    for (let shrub = 0; shrub < (patchIndex % 3 === 0 ? 12 : 6); shrub++) {
      const x = cx + (random() - 0.5) * rx * 1.4, z = cz + (random() - 0.5) * rz * 1.4, y = groundHeight(x, z);
      if (!reserved(x, z, y, 1.0)) {
        put(shrub % 3 ? 'shrub' : 'fern', x, y, z, 0.5 + random() * 0.8);
        for (let pocket = 0; pocket < 4; pocket++) {
          const px = x + (random() - 0.5) * 1.4, pz = z + (random() - 0.5) * 1.4;
          if (!reserved(px, pz, y, 0.3)) put(pocket % 2 ? 'tall' : 'fern', px, y, pz, 0.45 + random() * 0.5);
        }
      }
    }
  }

  // Broken lane margins use thin stones and grass tufts, leaving the full walking core clear.
  for (const lane of laneSamples) for (let i = 2; i < lane.samples.length - 2; i += 2) {
    const p = lane.samples[i]!, before = lane.samples[i - 1]!, after = lane.samples[i + 1]!;
    const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz);
    for (const sign of [-1, 1]) {
      const x = p[0] + sign * dz / length * (lane.width / 2 + random() * 0.6);
      const z = p[1] - sign * dx / length * (lane.width / 2 + random() * 0.6);
      const y = groundHeight(x, z);
      if (Math.abs(y - lane.y) > 0.1 || reserved(x, z, y, 0.06)) continue;
      if (random() > 0.18) put('short', x, y, z, 0.8 + random() * 0.6);
      if (random() > 0.66) put('small-stone', x, y, z, 0.35 + random() * 0.65);
    }
  }

  // Weathered natural outcrops overlap the textured collision cliffs without a block grid.
  for (const surface of surfaces.filter(item => item.id.endsWith('.cliff'))) {
    for (let edge = 0; edge < surface.vertices.length; edge += 12) {
      const ax = surface.vertices[edge]!, top = surface.vertices[edge + 1]!, az = surface.vertices[edge + 2]!;
      const bx = surface.vertices[edge + 3]!, bz = surface.vertices[edge + 5]!, bottom = surface.vertices[edge + 7]!;
      const length = Math.hypot(bx - ax, bz - az);
      const nx = (bz - az) / length, nz = -(bx - ax) / length;
      if (Math.max(Math.abs(ax), Math.abs(bx)) > 47.9 && Math.abs(ax - bx) < 0.01) continue;
      if (az < -44 && bz < -44 || az > 43 && bz > 43) continue;
      let stride = 1.8;
      for (let distance = 0.4; distance < length; distance += stride) {
        stride = 1.7 + random() * 1.7;
        const t = distance / length, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const outsideHeight = groundHeight(x + nx * 0.7, z + nz * 0.7);
        if (outsideHeight >= top - 0.05 || top < -0.1) continue;
        const exposedBottom = Math.max(bottom, outsideHeight, top === 0 ? -1.35 : -4);
        if (Math.abs(x + 7) < 2.35 && z > 2 && z < 11.5 || Math.abs(x + 14) < 2.05 && z > -21 && z < -12) continue;
        if (top === 0 && Math.abs(x - RURAL.bridge.x) < 2.4) continue;
        const relief = top - exposedBottom;
        if (relief > 1.5) {
          const broadBedrock = random() > 0.70 && length - distance > 3;
          if (broadBedrock) stride = 3.8 + random() * 2.3;
          const divisions = broadBedrock ? [0, 0.64 + random() * 0.18, 1]
            : random() > 0.5 ? [0, 0.29 + random() * 0.12, 0.63 + random() * 0.14, 1] : [0, 0.36 + random() * 0.20, 1];
          for (let layer = 0; layer < divisions.length - 1; layer++) {
            const layerBottom = exposedBottom + relief * divisions[layer]!;
            const layerTop = exposedBottom + relief * divisions[layer + 1]!;
            const height = layerTop - layerBottom;
            const along = (random() - 0.5) * (broadBedrock ? 0.5 : 0.9);
            const px = x + (bx - ax) / length * along, pz = z + (bz - az) / length * along;
            const width = broadBedrock ? stride * (layer === 0 ? 0.78 : 0.56) : 0.65 + random() * 1.08;
            const projection = layer === 0 ? 0.19 : 0.04 - layer * 0.025;
            put((layer + edge) % 2 ? 'fracture-0' : 'fracture-1', px + nx * projection,
              (layerTop + layerBottom) / 2, pz + nz * projection, width, height * (0.48 + random() * 0.05),
              0.48 + random() * 0.36, Math.atan2(nx, nz));
            if (layer < divisions.length - 2 && random() > 0.5) {
              put('moss', px + nx * 0.37, layerTop - 0.065, pz + nz * 0.37,
                Math.min(1.3, width * 0.77), 0.32, 0.48 + random() * 0.22);
              if (random() > 0.50) put('fern', px + nx * 0.38, layerTop - 0.02, pz + nz * 0.38, 0.32 + random() * 0.20);
            }
          }
          if (random() > 0.58) put('fracture-1', x + nx * 0.3, exposedBottom + 0.24, z + nz * 0.3, 0.5 + random() * 0.5, 0.24, 0.47, Math.atan2(nx, nz));
        } else {
          put('fracture-0', x + nx * 0.06, (exposedBottom + top) / 2, z + nz * 0.06,
            0.8 + random() * 0.4, relief * 0.48, 0.4 + random() * 0.3, Math.atan2(nx, nz));
        }
        if (random() > 0.3) put('moss', x - nx * 0.13, top + 0.025, z - nz * 0.13, 0.55 + random() * 0.5, 0.5, 0.7);
        const lipX = x - nx * 0.4, lipZ = z - nz * 0.4;
        if (!reserved(lipX, lipZ, top, 0.25)) {
          put('tall', lipX, top, lipZ, 0.7 + random() * 0.5);
          if (random() > 0.33) {
            put('shrub', lipX - nx * 0.2, top, lipZ - nz * 0.2, 0.46 + random() * 0.5);
            put('fern', lipX - nx * 0.5 + 0.3, top, lipZ - nz * 0.5, 0.45 + random() * 0.4);
          }
        }
        if (top === 0) {
          for (let reed = 0; reed < 3; reed++) {
            const offset = 0.45 + random() * 0.5;
            put('reed', x + nx * offset + (random() - 0.5) * 0.5, -0.8, z + nz * offset + (random() - 0.5) * 0.5, 0.65 + random() * 0.45);
          }
          put('rock', x + nx * 0.65, -0.83, z + nz * 0.65, 0.45 + random() * 0.75, 0.45, 0.5 + random() * 0.45);
        }
      }
    }
  }

  const colored = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.96 });
  colored.name = 'rural.library.vertex-pigment';
  const transform = new Object3D();
  const instances: Record<string, number> = {};
  for (const [name, batch] of library) {
    const isStone = name.startsWith('fracture-') || name === 'rock' || name === 'small-stone';
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
  const shallow = new Color(0x589d88), deep = new Color(0x257e82);
  const shores = ground.filter(surface => surface.id.includes('north-bank') || surface.id.includes('south-bank'));
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
    const mix = Math.max(0, Math.min(1, (edgeDepth - 0.4) / 3.7));
    const color = shallow.clone().lerp(deep, mix);
    color.multiplyScalar(0.96 + 0.095 * Math.sin(x * 0.27 + Math.sin(z * 0.55)) * Math.sin(z * 0.43 + x * 0.18));
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
    library: ['forked oak', 'upright alder', 'spreading orchard tree', 'compound shrub', 'fern', 'short grass', 'tall grass', 'cattail reed', 'white flower', 'yellow flower', 'weed', 'wheat', 'two fractured stone faces'],
    instances, totalInstances: Object.values(instances).reduce((a, b) => a + b, 0) + crests.count,
    distribution: 'authored ecological patches with path, structure, crop and stair exclusion; agriculture in rows',
    collision: 'triangle terrain/shore shared with Rapier; separate trunk, fence, raised bed and hero-architecture proxies; small plants/rock veneers noncolliding',
    water: 'opaque depth-colored surface with deterministic shallow geometry waves and current highlights; no simulation or screen-space effect',
    sourceImagesSampled: false,
  };
  const waterHeight = (x: number, z: number, elapsed: number) =>
    -1.16 + Math.sin(x * 0.65 + z * 1.6 + elapsed * 0.85) * 0.023 + Math.sin(x * 1.9 - z * 0.5 - elapsed * 0.55) * 0.009;
  function update(elapsed: number) {
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
