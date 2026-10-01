import { Box3, Group, Mesh, Vector3 } from 'three';
import type { Material, MeshStandardMaterial, Object3D } from 'three';
import { RURAL } from '../simulation/rural-layout';
import { preparedGlbScene } from './abortable-glb';
import type { PreparationScheduler } from '../render/preparation-scheduler';
import type { PreparationResources } from '../render/preparation-cache';

export function inspectRuralAsset(root: Object3D, id: string) {
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root, true);
  const dimensions = bounds.getSize(new Vector3()).toArray();
  const materials = new Map<string, { name: string; color: string | null }>();
  let triangles = 0, meshes = 0;
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
      const mat = item as Material & Partial<MeshStandardMaterial>;
      materials.set(mat.name, { name: mat.name, color: mat.color?.getHexString() ?? null });
    }
  });
  if (!dimensions.every(v => Number.isFinite(v) && v > 0) || triangles < 12 || materials.size < 2) {
    throw new Error(`Invalid rural asset geometry/materials: ${id}`);
  }
  if (id === 'cottage' && (dimensions[0] < 7 || dimensions[0] > 11 || dimensions[1] < 5 || dimensions[1] > 9)) {
    throw new Error(`Cottage scale drift: ${dimensions.join(', ')}`);
  }
  if (id === 'bridge' && (dimensions[2] < 13.8 || dimensions[2] > 15.5 || dimensions[0] < 3.4 || dimensions[0] > 5.5)) {
    throw new Error(`Bridge scale/orientation drift: ${dimensions.join(', ')}`);
  }
  return { id: `rural.${id}`, dimensions, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    meshes, triangles, materials: [...materials.values()] };
}

export async function loadRuralAssets(target: Group, signal?: AbortSignal, scheduler?: PreparationScheduler, scope?: PreparationResources) {
  const facts = [];
  // Add each loaded scene immediately so renderer failure cleanup owns it too.
  for (const name of ['cottage', 'shed', 'bridge'] as const) {
    const url = `/assets/rural/${name}.glb`;
    const scene = await preparedGlbScene(url, `rural.${name}`, signal, scheduler, scope);
    target.add(scene);
    facts.push(inspectRuralAsset(scene, name));
    const p = RURAL[name];
    scene.name = `rural.${name}`;
    scene.position.set(p.x, p.y + (name === 'bridge' ? 0.08 : 0), p.z);
    scene.traverse(object => {
      if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
  }
  return facts;
}
