import {
  CanvasTexture, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial,
  RepeatWrapping, SRGBColorSpace, Vector3,
} from 'three';
import type { Object3D } from 'three';
import { randomSequence } from './rural-geometry';

type SurfaceKind = 'plaster' | 'timber' | 'clay' | 'stone';

/** Authored washes and tool marks, independent of the reference pixels or GLB geometry. */
function surfacePigment(kind: SurfaceKind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Hero pigment canvas unavailable');
  const random = randomSequence(104729 + kind.charCodeAt(0) * 137);
  ctx.fillStyle = '#faf8f1'; ctx.fillRect(0, 0, 512, 512);
  const colors = {
    plaster: ['#cfc6ab', '#ece1c1', '#a49c80'],
    timber: ['#baaa8a', '#7c6c53', '#e4d1ad'],
    clay: ['#d2b99d', '#a3a17d', '#f3d9b8'],
    stone: ['#c5c5a9', '#919e7d', '#e2d9bc'],
  }[kind];
  // Medium washes; no dense speckle or photorealistic grunge.
  for (let i = 0; i < 110; i++) {
    const x = random() * 512, y = random() * 512, radius = 12 + random() * 76;
    for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
      const wash = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
      wash.addColorStop(0, `${colors[i % 3]}${kind === 'timber' ? '38' : '48'}`);
      wash.addColorStop(1, `${colors[i % 3]}00`);
      ctx.fillStyle = wash; ctx.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
    }
  }
  if (kind === 'timber') {
    // Long interrupted grain follows the length of each connected timber piece.
    for (let i = 0; i < 160; i++) {
      const x = random() * 512, y = random() * 420;
      ctx.strokeStyle = i % 3 ? '#74604730' : '#e1cba546';
      ctx.lineWidth = 0.8 + random() * 2.8;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - 3, y + 30, x + 5, y + 65, x + (random() - 0.5) * 9, y + 45 + random() * 130);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = '#6554422b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(random() * 512, random() * 512, 3 + random() * 4, 14 + random() * 17, 0, 0, Math.PI * 2); ctx.stroke();
    }
  } else {
    for (let i = 0; i < 130; i++) {
      const x = random() * 512, y = random() * 512;
      ctx.fillStyle = `${colors[i % 3]}${kind === 'plaster' ? '0c' : '28'}`;
      ctx.beginPath(); ctx.ellipse(x, y, 3 + random() * 20, 1.5 + random() * 8, random() * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  const map = new CanvasTexture(canvas);
  map.name = `rural.hero.${kind}.pigment.512`;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
  return map;
}

/** Find the long axis of disconnected pieces in material-merged timber GLBs. */
function timberAxes(mesh: Mesh) {
  const positions = mesh.geometry.getAttribute('position');
  const parent = Array.from({ length: positions.count }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; }
    return i;
  };
  const index = mesh.geometry.index;
  const count = index?.count ?? positions.count;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i;
    for (let k = 1; k < 3; k++) parent[find(index ? index.getX(i + k) : i + k)] = find(a);
  }
  const bounds = new Map<number, { min: Vector3; max: Vector3 }>();
  const point = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    const root = find(i); point.fromBufferAttribute(positions, i);
    const box = bounds.get(root);
    if (box) { box.min.min(point); box.max.max(point); }
    else bounds.set(root, { min: point.clone(), max: point.clone() });
  }
  return parent.map((_, i) => {
    const box = bounds.get(find(i))!;
    const size = box.max.clone().sub(box.min);
    return size.y >= size.x && size.y >= size.z ? 1 : size.x >= size.z ? 0 : 2;
  });
}

/** Changes only render attributes/materials: original positions, indices and proxies survive. */
export function enrichRuralHero(root: Object3D) {
  const maps = new Map<SurfaceKind, CanvasTexture>();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const name = material.name;
    const kind: SurfaceKind | null = name.startsWith('plaster') ? 'plaster'
      : /^(timber|door_oak|bridge_oak)/.test(name) ? 'timber'
      : /^(terracotta|teal_)/.test(name) ? 'clay'
      : name.startsWith('stone') ? 'stone' : null;
    if (!kind) return;
    if (!maps.has(kind)) maps.set(kind, surfacePigment(kind));
    material.map = maps.get(kind)!;
    material.vertexColors = true;
    material.roughness = kind === 'clay' ? 0.86 : 0.96;
    const position = object.geometry.getAttribute('position');
    const normal = object.geometry.getAttribute('normal');
    const axes = kind === 'timber' ? timberAxes(object) : null;
    const uv: number[] = [], colors: number[] = [];
    const point = new Vector3(), direction = new Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      direction.fromBufferAttribute(normal, i).transformDirection(object.matrixWorld);
      const { x, y, z } = point;
      if (kind === 'timber') {
        const axis = axes![i]!;
        const components = [x, y, z];
        const along = components[axis]!;
        const across = axis === 1 ? Math.abs(direction.z) > Math.abs(direction.x) ? x : z
          : axis === 0 ? Math.abs(direction.y) > Math.abs(direction.z) ? z : y
          : Math.abs(direction.y) > Math.abs(direction.x) ? x : y;
        uv.push(across / 0.65, along / 3.2);
      } else if (kind === 'clay') uv.push(x / 3.8, z / 3.8);
      else uv.push((Math.abs(direction.x) > Math.abs(direction.z) ? z : x) / 4, y / 4);
      const broad = Math.sin(x * 1.4 + z * 0.8 + y * 0.4) * Math.cos(y * 1.1 - z * 0.6);
      const groundContact = Math.exp(-Math.max(0, y - 0.06) / (kind === 'plaster' ? 0.68 : 0.42));
      const shade = 1 + broad * (kind === 'plaster' ? 0.055 : 0.085) - groundContact * 0.23;
      const tint = new Color(shade, shade, shade);
      if (kind === 'stone' && y < 0.65) tint.lerp(new Color(0.61, 0.67, 0.46), groundContact * 0.4);
      colors.push(tint.r, tint.g, tint.b);
    }
    object.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    object.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    material.needsUpdate = true;
  });
  root.userData.materialTreatment = 'M2.1 deterministic plaster washes, lengthwise timber grain, clay pigment, stone mottling and ground contact; original GLB geometry unchanged';
}
