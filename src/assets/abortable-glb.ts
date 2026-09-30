import { Mesh, Texture } from 'three';
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
