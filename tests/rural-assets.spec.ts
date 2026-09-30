import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Raycaster, Vector3 } from 'three';
import { inspectRuralAsset } from '../src/assets/rural';

async function asset(name: string) {
  const data = await readFile(`public/assets/rural/${name}.glb`);
  const root = (await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, '')).scene;
  root.updateMatrixWorld(true);
  return root;
}

test('Blender cottage has human-scale geometry on every elevation after actual GLTFLoader import', async () => {
  const root = await asset('cottage');
  const report = inspectRuralAsset(root, 'cottage');
  expect(report.materials.length).toBeGreaterThan(4);
  for (const [x,z] of [[12,0],[-12,0],[0,12],[0,-12]]) {
    const origin = new Vector3(x, 2, z);
    const ray = new Raycaster(origin, new Vector3(-x,0,-z).normalize());
    const hit = ray.intersectObject(root,true)[0];
    expect(hit, `solid elevation facing ${x},${z}`).toBeTruthy();
    expect(hit!.distance).toBeLessThan(10);
  }
});

test('Blender bridge exports longitudinal Z axis and deck-top origin without runtime correction', async () => {
  const root = await asset('bridge');
  const report = inspectRuralAsset(root, 'bridge');
  expect(report.dimensions[2]).toBeGreaterThan(13.8);
  for (const z of [-6,0,6]) {
    const hit = new Raycaster(new Vector3(0,5,z), new Vector3(0,-1,0)).intersectObject(root,true)[0];
    expect(hit).toBeTruthy();
    expect(Math.abs(hit!.point.y)).toBeLessThan(0.09);
  }
});

test('garden shed is a complete meter-scale asset with exported colored materials', async () => {
  const report = inspectRuralAsset(await asset('shed'), 'shed');
  expect(report.dimensions[0]).toBeGreaterThan(2.9);
  expect(report.dimensions[0]).toBeLessThan(4.5);
  expect(report.dimensions[1]).toBeGreaterThan(2);
  expect(new Set(report.materials.map(m => m.color)).size).toBeGreaterThan(3);
});
