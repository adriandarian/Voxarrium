import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { enrichRuralHero } from '../render/hero-materials';

export const DISTRICT_MODULE_IDS = ['wall', 'stone', 'post', 'beam', 'brace', 'window', 'shop-window',
  'door', 'doorstep', 'stair', 'gable-cap', 'roof-gable', 'roof-hip', 'roof-mansard', 'chimney',
  'balcony', 'railing', 'awning', 'sign', 'lantern', 'barrel', 'crate', 'stall', 'tower'] as const;
export type DistrictModuleId = typeof DISTRICT_MODULE_IDS[number];

/** Actual GLTFLoader geometry/material inventory, independently useful in Node tests. */
export function inspectDistrictKit(root: Object3D) {
  root.updateMatrixWorld(true);
  const modules = new Map<string, { meshes: number; triangles: number; bounds: Box3 }>();
  const materials = new Set<string>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const id = object.userData.module_id as string;
    if (!DISTRICT_MODULE_IDS.includes(id as DistrictModuleId)) throw new Error(`Unknown district module: ${id}`);
    const item = modules.get(id) ?? { meshes: 0, triangles: 0, bounds: new Box3() };
    item.meshes++;
    item.triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    item.bounds.union(new Box3().setFromObject(object, true)); modules.set(id, item);
    if (!(object.material instanceof MeshStandardMaterial)) throw new Error('District primitive requires one standard material');
    materials.add(object.material.name);
  });
  for (const id of DISTRICT_MODULE_IDS) if (!modules.has(id)) throw new Error(`Missing district module: ${id}`);
  const wall = modules.get('wall')!.bounds.getSize(new Vector3());
  const door = modules.get('door')!.bounds.getSize(new Vector3());
  if (Math.abs(wall.x - 1) > .001 || Math.abs(wall.y - 1) > .001 || Math.abs(wall.z - .24) > .001 ||
      door.y < 2.16 || door.y > 2.65 || door.x < 1.18 || door.x > 1.7) throw new Error('District meter/axis contract drift');
  return { id: 'district.kit', moduleCount: modules.size, materials: [...materials],
    meshes: [...modules.values()].reduce((sum, m) => sum + m.meshes, 0),
    triangles: [...modules.values()].reduce((sum, m) => sum + m.triangles, 0),
    modules: [...modules].map(([id, value]) => ({ id, meshes: value.meshes, triangles: value.triangles,
      min: value.bounds.min.toArray(), max: value.bounds.max.toArray() })) };
}

export async function loadDistrictKit() {
  const root = (await new GLTFLoader().loadAsync('/assets/district/district-kit.glb')).scene;
  const facts = inspectDistrictKit(root);
  enrichRuralHero(root);
  return { root, facts };
}
