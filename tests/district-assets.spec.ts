import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Box3, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DISTRICT_MODULE_IDS, inspectDistrictKit } from '../src/assets/district';
import { composeDistrictArchitecture } from '../src/render/district';
import { DISTRICT_BUILDINGS } from '../src/simulation/district-layout';

async function load() {
  const data = await readFile('public/assets/district/district-kit.glb');
  const root = (await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,
    data.byteOffset + data.byteLength) as ArrayBuffer, '')).scene;
  root.updateMatrixWorld(true);
  return { data, root };
}

function moduleRoot(root: Object3D, id: string) {
  const result = new Object3D();
  root.traverse(object => {
    if (object instanceof Mesh && object.userData.module_id === id) result.add(object.clone());
  });
  result.updateMatrixWorld(true); return result;
}

test('real district GLB matches retained local Blender checksum and module inventory', async () => {
  const { data, root } = await load();
  const report = JSON.parse(await readFile('assets/source/district-kit.report.json', 'utf8'));
  const imported = inspectDistrictKit(root);
  expect(createHash('sha256').update(data).digest('hex')).toBe(report.assets[0].sha256);
  expect(imported.triangles).toBe(report.assets[0].triangles);
  expect(imported.moduleCount).toBe(32);
  expect(new Set(imported.modules.map(m => m.id))).toEqual(new Set(DISTRICT_MODULE_IDS));
  expect(imported.materials.length).toBeGreaterThan(20);
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    expect(object.material).toBeInstanceOf(MeshStandardMaterial);
    expect((object.material as MeshStandardMaterial).map).toBeNull();
    expect(object.userData.units).toBe('meters');
  });
});

test('actual imported modules preserve meter axes, human door and front recess without corrective transforms', async () => {
  const { root } = await load();
  const wall = new Box3().setFromObject(moduleRoot(root, 'wall'));
  expect(wall.min.toArray()).toEqual([-0.5, 0, expect.closeTo(-.24, 5)]);
  expect(wall.max.toArray()).toEqual([.5, 1, 0]);
  const threshold = moduleRoot(root, 'doorstep');
  const top = new Raycaster(new Vector3(0,2,.22),new Vector3(0,-1,0)).intersectObject(threshold,true)[0];
  expect(top.point.y).toBeCloseTo(.18,5);
  const leaf = new Raycaster(new Vector3(0,1.2,2),new Vector3(0,0,-1)).intersectObject(moduleRoot(root,'door'),true)[0];
  expect(leaf).toBeTruthy(); expect(leaf.point.z).toBeLessThan(-.045);
  const window = new Raycaster(new Vector3(.16,.70,2),new Vector3(0,0,-1)).intersectObject(moduleRoot(root,'window'),true)[0];
  expect(window).toBeTruthy(); expect(window.point.z).toBeLessThan(-.07);
  const tower = new Box3().setFromObject(moduleRoot(root,'tower'));
  expect(tower.max.y).toBeGreaterThan(8); expect(tower.min.y).toBeLessThan(.03);
});

test('27 composed lots share module instance batches and expose individual roof rain envelopes', async () => {
  const { root } = await load(); const district = composeDistrictArchitecture(root);
  expect(district.facts.buildings).toBe(27);
  expect(district.facts.archetypes.length).toBe(6);
  expect(district.facts.instanceBatches).toBeLessThanOrEqual(131);
  expect(district.facts.totalInstances).toBeGreaterThan(2500);
  expect(district.group.children.every(object => object instanceof InstancedMesh)).toBe(true);
  for (const mesh of district.group.children as InstancedMesh[]) {
    expect(mesh.userData.buildingIds.length).toBe(mesh.count);
    const matrix = new Object3D();
    for (let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,matrix.matrix);
      expect(matrix.matrix.determinant()).toBeGreaterThan(0);
    }
  }
  // Rain receives lot envelopes rather than one aggregate district-sized mesh box.
  expect(district.facts.roofEnvelopes.length).toBeGreaterThanOrEqual(27);
  for (const envelope of district.facts.roofEnvelopes) {
    expect(envelope.max[0]-envelope.min[0]).toBeLessThan(18);
    expect(envelope.max[2]-envelope.min[2]).toBeLessThan(18);
  }
  expect(district.facts.marketStalls.every(stall => Math.abs(stall.x-89)>4)).toBe(true);
});

test('representative archetypes have solid imported sides/rears, recessed front doors and closed roof tops', async () => {
  const { root } = await load(); const { group } = composeDistrictArchitecture(root);
  group.updateMatrixWorld(true);
  const types = ['residential','merchant','workshop','townhouse','canal','civic'] as const;
  for (const type of types) {
    const building = DISTRICT_BUILDINGS.find(b => b.archetype===type)!;
    const object = new Object3D(); object.position.set(building.position.x,building.position.y,building.position.z);
    object.rotation.y=building.yaw;object.updateMatrixWorld(true);
    for (const [x,z] of [[building.width/2+1,0],[-building.width/2-1,0],[0,building.depth/2+1],[0,-building.depth/2-1]]) {
      const origin = new Vector3(x,1.70,z).applyMatrix4(object.matrixWorld);
      const direction = new Vector3(-x,0,-z).normalize().transformDirection(object.matrixWorld);
      const hit = new Raycaster(origin,direction,0,2.4).intersectObject(group,true)[0];
      expect(hit,`${type} complete elevation ${x},${z}`).toBeTruthy();
      const mesh = hit.object as InstancedMesh;
      expect(mesh.userData.buildingIds[hit.instanceId!]).toBe(building.id);
      if (x===0 && z>0) expect(mesh.userData.moduleId).toBe('door');
    }
    // The civic belfry sits above the main roof center; sample the opposite wing.
    const origin=new Vector3(type==='civic' ? -building.width*.30 : 0,
      building.floors*building.floorHeight+building.roofHeight+3,0).applyMatrix4(object.matrixWorld);
    const roof=new Raycaster(origin,new Vector3(0,-1,0),0,8).intersectObject(group,true)[0];
    expect(roof,`${type} sealed roof`).toBeTruthy();
    expect((roof.object as InstancedMesh).userData.moduleId).toMatch(/roof-/);
  }
});
