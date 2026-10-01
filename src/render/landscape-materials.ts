import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { RURAL_TREES } from '../simulation/rural';
import type { CourseSpec } from '../simulation/types';
import { finishPreparation } from './preparation-scheduler';
import { preparationResources } from './preparation-cache';
import type { PreparationResources } from './preparation-cache';

/** Project-authored pigment textures. No reference pixels are shipped or sampled. */
export function createLandscapeMaterials() { return finishPreparation(landscapeMaterialJobs()); }
export function* landscapeMaterialJobs(scope?: PreparationResources) {
  const ownership = preparationResources(scope);
  function* texture(kind: 'grass' | 'stone' | 'path' | 'soil') {
    const cached = ownership.cache?.get<CanvasTexture>(`landscape.texture.${kind}`);
    if (cached) {
      const material = ownership.own(new MeshStandardMaterial({ color: 0xffffff, map: ownership.own(cached), roughness: 1, vertexColors: kind === 'grass' }));
      material.name = `landscape.${kind}`; return material;
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Landscape pigment canvas unavailable');
    let state = 7319;
    const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const colors = {
      grass: ['#6d793e', '#536131', '#7e8847', '#929251', '#676b39'],
      stone: ['#77755e', '#626451', '#9a9679', '#86896b', '#646653'],
      path: ['#bfaa77', '#b7a16d', '#c9b687', '#a99361', '#c2ac78'],
      soil: ['#6d5737', '#58472e', '#816746', '#74633b', '#615334'],
    }[kind];
    ctx.fillStyle = colors[0]!; ctx.fillRect(0, 0, 512, 512);
    // Overlapping translucent washes wrap at edges, without a tiled cell pattern.
    for (let i = 0; i < 180; i++) {
      if (i % 8 === 0) yield `landscape.${kind}.washes`;
      const x = rand() * 512, y = rand() * 512, r = 12 + rand() * 74;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        const gradient = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gradient.addColorStop(0, `${colors[1 + i % 4]}99`);
        gradient.addColorStop(1, `${colors[1 + i % 4]}00`);
        ctx.fillStyle = gradient; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    // Small broken pigment strokes remain subordinate to authored landforms.
    ctx.globalAlpha = kind === 'grass' ? 0.20 : 0.14;
    for (let i = 0; i < 8500; i++) {
      if (i % 128 === 0) yield `landscape.${kind}.strokes`;
      const x = rand() * 512, y = rand() * 512;
      ctx.fillStyle = colors[1 + i % 4]!;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.5 + rand() * 2.3, 0.4 + rand() * 1.8, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    const map = ownership.own(new CanvasTexture(canvas)); map.name = `pigment.${kind}.512`;
    map.wrapS = map.wrapT = RepeatWrapping; map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    ownership.cache?.retain(`landscape.texture.${kind}`, map, [map]);
    const material = ownership.own(new MeshStandardMaterial({ color: 0xffffff, map, roughness: 1, vertexColors: kind === 'grass' }));
    material.name = `landscape.${kind}`;
    return material;
  }
  return { grass: yield* texture('grass'), stone: yield* texture('stone'), path: yield* texture('path'), soil: yield* texture('soil') };
}

type PigmentLane = { points: readonly (readonly [number, number])[]; width: number; y: number };
type Point3 = readonly [number, number, number];

/** Coplanar render subdivision permits meter-scale color contexts without changing collision. */
export function applyTerrainPigment(source: BufferGeometry, course: CourseSpec, lanes: readonly PigmentLane[], cliff: boolean, shore: boolean) {
  return finishPreparation(terrainPigmentJobs(source, course, lanes, cliff, shore));
}
export function* terrainPigmentJobs(source: BufferGeometry, course: CourseSpec, lanes: readonly PigmentLane[], cliff: boolean, shore: boolean, scope?: PreparationResources) {
  const ownership = preparationResources(scope);
  const vertices: number[] = [];
  const positions = source.getAttribute('position');
  const indices = source.index;
  const maxEdge = cliff || shore ? 2.4 : 3.5;
  const distance = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const midpoint = (a: Point3, b: Point3): Point3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  function* subdivide(a: Point3, b: Point3, c: Point3, depth: number): Generator<string, void, unknown> {
    if (depth >= 7 || Math.max(distance(a, b), distance(b, c), distance(c, a)) < maxEdge) {
      vertices.push(...a, ...b, ...c); if (vertices.length % 1152 === 0) yield 'terrain.subdivision'; return;
    }
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    yield* subdivide(a, ab, ca, depth + 1); yield* subdivide(ab, b, bc, depth + 1);
    yield* subdivide(ca, bc, c, depth + 1); yield* subdivide(ab, bc, ca, depth + 1);
  };
  for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
    const points = [0, 1, 2].map(k => {
      const j = indices ? indices.getX(i + k) : i + k;
      return [positions.getX(j), positions.getY(j), positions.getZ(j)] as const;
    });
    yield* subdivide(points[0]!, points[1]!, points[2]!, 0);
    yield 'terrain.subdivision';
  }
  ownership.release(source);
  const geometry = ownership.own(new BufferGeometry());
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const segmentDistance = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / Math.max(0.001, dx * dx + dz * dz)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const tops = (course.surfaces ?? []).filter(surface => surface.id.endsWith('.top'));
  const colors: number[] = [];
  const warmEarth = new Color(0.82, 0.78, 0.60), dampGreen = new Color(0.69, 0.85, 0.68);
  const woodland = new Color(0.72, 0.79, 0.63);
  for (let i = 0; i < vertices.length; i += 3) {
    if (i % 384 === 0) yield 'terrain.pigment';
    const x = vertices[i]!, y = vertices[i + 1]!, z = vertices[i + 2]!;
    let pathDistance = 100, edgeDistance = 100;
    for (const lane of lanes) {
      if (Math.abs(lane.y - y) > 0.2) continue;
      for (let j = 1; j < lane.points.length; j++) {
        const a = lane.points[j - 1]!, b = lane.points[j]!;
        pathDistance = Math.min(pathDistance, segmentDistance(x, z, a[0], a[1], b[0], b[1]) - lane.width / 2);
      }
    }
    for (const surface of tops) {
      if (Math.abs(surface.vertices[1]! - y) > 0.2) continue;
      for (let j = 0; j < surface.vertices.length; j += 3) {
        const next = (j + 3) % surface.vertices.length;
        edgeDistance = Math.min(edgeDistance, segmentDistance(x, z, surface.vertices[j]!, surface.vertices[j + 2]!, surface.vertices[next]!, surface.vertices[next + 2]!));
      }
    }
    let treeDistance = 100;
    for (const tree of RURAL_TREES) if (Math.abs(y - tree[1]) < 0.2) treeDistance = Math.min(treeDistance, Math.hypot(x - tree[0], z - tree[2]));
    const broad = Math.sin(x * 0.16 + Math.sin(z * 0.13)) * Math.cos(z * 0.20 - x * 0.08);
    const color = new Color(1, 1, 1).multiplyScalar(0.96 + broad * 0.075);
    if (cliff) {
      // Existing rock triangles receive warm-earth upper contacts and mossy lower fill.
      const soilLine = y > 3.4 && y < 4.02 || y > 6.8 && y < 7.42;
      color.lerp(new Color(0.69, 0.62, 0.46), soilLine ? 0.45 : 0.08);
      color.multiplyScalar(0.92 + Math.sin(x * 0.7 + z * 0.5 + y * 1.6) * 0.07);
    } else if (shore) {
      color.lerp(dampGreen, 0.35).multiplyScalar(0.87);
    } else {
      color.lerp(warmEarth, Math.exp(-Math.max(0, pathDistance) / 2.4) * 0.65);
      color.lerp(woodland, Math.exp(-treeDistance / 4.5) * 0.82);
      color.lerp(dampGreen, y < 0.2 ? Math.exp(-edgeDistance / 4) * 0.7 : 0.12 * Math.exp(-edgeDistance / 2.2));
      const cottageDistance = Math.hypot(Math.max(0, Math.abs(x) - 4.2), Math.max(0, Math.abs(z + 7) - 3.7));
      if (Math.abs(y - 4) < 0.2) color.lerp(warmEarth, Math.exp(-cottageDistance / 1.5) * 0.5);
    }
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Planar coordinates in meters; surface triangulation never draws a visible grid. */
export function applyLandscapeUV(geometry: BufferGeometry, kind: 'ground' | 'cliff') {
  const positions = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    uv.push(kind === 'ground' ? x / 18 : (x + z) / 7, kind === 'ground' ? z / 18 : y / 7);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}
