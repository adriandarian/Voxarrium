import { Mesh, Texture } from 'three';
import type { Material, Object3D } from 'three';
import { heroMaterialJobs } from '../render/hero-materials';
import { preparationResources } from '../render/preparation-cache';
import type { PreparationResources } from '../render/preparation-cache';
import type { PreparationScheduler } from '../render/preparation-scheduler';
import { finishPreparation } from '../render/preparation-scheduler';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Fetch can be canceled; parsing cannot. Late parsed resources are released. */
export async function loadAbortableGlb(url: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Asset ${url}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer(); signal.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
  if (signal.aborted) {
    const resources = new Set<{ dispose(): void }>();
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) resources.add(value);
      }
    });
    resources.forEach(resource => resource.dispose()); signal.throwIfAborted();
  }
  return gltf;
}


export function glbSceneResources(root: Object3D) {
  const result = new Set<{ dispose(): void }>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    result.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      result.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) result.add(value);
    }
  });
  return result;
}

/** The four shipped immutable GLB templates live in the bounded renderer cache.
 * Geometry/maps are shared; mutable materials and object transforms belong to each instance.
 */
export async function preparedGlbScene(url: string, key: string, signal?: AbortSignal,
  scheduler?: PreparationScheduler, scope?: PreparationResources) {
  const ownership = preparationResources(scope);
  const lookup = () => ownership.cache?.get<Object3D>(`glb.${key}`);
  let template = ownership.transition ? ownership.transition.span('asset-lookup', lookup, { assetId: key }) : lookup();
  if (!template) {
    const load = () => signal ? loadAbortableGlb(url, signal) : new GLTFLoader().loadAsync(url);
    const gltf = ownership.transition ? await ownership.transition.asyncSpan('asset-load-parse', load, { assetId: key }) : await load();
    template = gltf.scene;
    for (const resource of glbSceneResources(template)) ownership.own(resource);
    if (scheduler) await scheduler.run('asset.material-treatment', heroMaterialJobs(template, scope));
    else finishPreparation(heroMaterialJobs(template, scope));
    if (!ownership.cache) return template;
    const resources = glbSceneResources(template);
    ownership.cache.retain(`glb.${key}`, template, resources);
    for (const resource of resources) ownership.release(resource);
  }
  ownership.transition?.event('asset-reuse', { assetId: key });
  const instance = template.clone(true);
  const materials = new Map<Material, Material>();
  const meshes: Mesh[] = []; instance.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  function* cloneResources() {
    for (const object of meshes) {
      ownership.own(object.geometry);
      const clone = (source: Material) => {
        let material = materials.get(source);
        if (!material) { material = ownership.own(source.clone()); materials.set(source, material); }
        for (const value of Object.values(material)) if (value instanceof Texture) ownership.own(value);
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
      yield 'asset.instance-materials';
    }
    return instance;
  }
  return scheduler ? scheduler.run('asset.clone', cloneResources()) : finishPreparation(cloneResources());
}
