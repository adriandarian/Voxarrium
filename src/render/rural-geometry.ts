import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type EnvironmentRegister = (name: string, geometry: BufferGeometry, shadows?: boolean) => void;
export type EnvironmentPut = (name: string, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number, yaw?: number, tint?: number) => void;
export interface EcologyContext {
  random: () => number;
  groundHeight: (x: number, z: number) => number;
  pathDistance: (x: number, z: number, y: number) => number;
  reserved: (x: number, z: number, y: number, extra?: number) => boolean;
  put: EnvironmentPut;
}

export function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export function pigment(source: BufferGeometry, hex: number, variation = 0.1) {
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

export function combined(parts: BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error('Rural geometry library failed to merge.');
  for (const part of parts) part.dispose();
  return geometry;
}

export function branch(a: Vector3, b: Vector3, bottom: number, top: number, color: number, sides = 7) {
  const direction = b.clone().sub(a);
  const geometry = new CylinderGeometry(top, bottom, direction.length(), sides, 1);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const result = pigment(geometry, color, 0.13);
  geometry.dispose();
  return result;
}

/** A thick creased leaf: a small solid blade with six faces, never a billboard. */
export function blade(height: number, width: number, bend: number, color: number) {
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

export function lobe(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, detail = 1, smooth = false) {
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

