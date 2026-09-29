import { Box3, Mesh, Vector3 } from 'three';
import type { Color, Material, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FIXTURE = {
  id: 'diagnostics.scale-cube',
  url: '/assets/diagnostics/scale-fixture.glb',
  position: { x: -4, y: 0, z: 10 },
} as const;

const EPSILON = 0.0001;
const EXPECTED_AXES = {
  axis_blender_x: [1.5, 0, 0],
  axis_blender_y: [0, 0, -1.5],
  axis_blender_z: [0, 1.5, 0],
} as const;

function near(actual: number[], expected: readonly number[]) {
  return actual.every((value, index) => Math.abs(value - expected[index]) < EPSILON);
}

function materialFacts(material: Material) {
  const colored = material as Material & { color?: Color };
  return {
    name: material.name,
    type: material.type,
    color: colored.color?.getHexString() ?? null,
    linearRgb: colored.color ? [colored.color.r, colored.color.g, colored.color.b] : null,
  };
}

/** Inspect imported geometry before any placement transform or corrective rotation. */
export function inspectFixture(root: Object3D) {
  root.updateMatrixWorld(true);
  const cube = root.getObjectByName('fixture_cube_1m');
  if (!cube) throw new Error('Scale fixture is missing fixture_cube_1m; rerun npm run blender:fixture and vendor its output.');
  const bounds = new Box3().setFromObject(cube, true);
  const dimensions = bounds.getSize(new Vector3()).toArray();
  const min = bounds.min.toArray();
  const max = bounds.max.toArray();
  if (!near(dimensions, [1, 1, 1]) || !near(min, [-0.5, 0, -0.5]) || !near(max, [0.5, 1, 0.5])) {
    throw new Error(`Scale fixture must be one meter, Y-up, feet at Y=0. Imported bounds: ${JSON.stringify({ min, max, dimensions })}. Check Blender units and glTF export transforms.`);
  }

  const axes = Object.entries(EXPECTED_AXES).map(([name, expected]) => {
    const marker = root.getObjectByName(name);
    if (!marker) throw new Error(`Scale fixture lacks ${name}; export the current asymmetric axis fixture before running M1.`);
    const center = new Box3().setFromObject(marker, true).getCenter(new Vector3()).toArray();
    if (!near(center, expected)) {
      throw new Error(`Fixture ${name} imported at ${JSON.stringify(center)}, expected ${JSON.stringify(expected)}. Do not apply an extra axis correction to the glTF scene.`);
    }
    const markerMaterials: ReturnType<typeof materialFacts>[] = [];
    marker.traverse(object => {
      if (object instanceof Mesh) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) markerMaterials.push(materialFacts(material));
      }
    });
    const channel = name.endsWith('_x') ? 0 : name.endsWith('_y') ? 1 : 2;
    const colorPassed = markerMaterials.length > 0 && markerMaterials.every(material => {
      const rgb = material.linearRgb;
      return rgb !== null && rgb[channel] > 0.35 && rgb.every((component, index) => index === channel || component < rgb[channel] * 0.8);
    });
    if (!colorPassed) {
      throw new Error(`Fixture ${name} lost its ${['red', 'green', 'blue'][channel]} material. Set the Blender Principled BSDF Base Color before glTF export; do not recolor it in the runtime.`);
    }
    return { name, expected: [...expected], actual: center, materials: markerMaterials, colorPassed, passed: true };
  });

  const materials: ReturnType<typeof materialFacts>[] = [];
  let triangles = 0;
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const fact = materialFacts(material);
      if (!materials.some(item => item.name === fact.name && item.color === fact.color)) materials.push(fact);
    }
  });
  return { id: FIXTURE.id, url: FIXTURE.url, toleranceMeters: EPSILON, dimensions, bounds: { min, max }, axes, materials, triangles, passed: true };
}

export async function loadScaleFixture() {
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(FIXTURE.url);
  } catch (error) {
    throw new Error(`Unable to load ${FIXTURE.url}. Export and vendor the Blender fixture before starting the runtime. ${String(error)}`);
  }
  let facts;
  try {
    facts = inspectFixture(gltf.scene);
  } catch (error) {
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    throw error;
  }
  gltf.scene.name = FIXTURE.id;
  gltf.scene.position.set(FIXTURE.position.x, FIXTURE.position.y, FIXTURE.position.z);
  gltf.scene.traverse(object => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { object: gltf.scene, facts: { ...facts, placedAt: { ...FIXTURE.position } } };
}
