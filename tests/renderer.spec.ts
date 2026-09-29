import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Mesh, MeshStandardMaterial } from 'three';
import { inspectFixture } from '../src/assets/fixture';
import { FrameTimings } from '../src/diagnostics/timing';

async function fixture() {
  const buffer = await readFile('public/assets/diagnostics/scale-fixture.glb');
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return (await new GLTFLoader().parseAsync(bytes, '')).scene;
}

test('vendored Blender fixture imports at one meter with the documented axis conversion', async () => {
  const report = inspectFixture(await fixture());
  expect(report.dimensions).toEqual([1, 1, 1]);
  expect(report.bounds).toEqual({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] });
  expect(report.axes).toHaveLength(3);
  expect(report.axes.every(axis => axis.passed)).toBe(true);
  expect(report.axes.every(axis => axis.colorPassed)).toBe(true);
  expect(report.materials.map(material => material.name)).toEqual(expect.arrayContaining(['calibration_neutral', 'axis_x', 'axis_y', 'axis_z']));
});

test('fixture inspection rejects unit drift', async () => {
  const object = await fixture();
  object.scale.setScalar(100);
  expect(() => inspectFixture(object)).toThrow(/one meter/);
});

test('asymmetric markers catch a rotation that the symmetric cube cannot establish', async () => {
  const object = await fixture();
  object.rotation.y = Math.PI / 2;
  expect(() => inspectFixture(object)).toThrow(/axis_blender_x imported at/);
});

test('fixture inspection refuses old exports without orientation evidence', async () => {
  const object = await fixture();
  object.getObjectByName('axis_blender_z')!.removeFromParent();
  expect(() => inspectFixture(object)).toThrow(/lacks axis_blender_z/);
});

test('fixture inspection rejects exported default gray in place of the colored axes', async () => {
  const object = await fixture();
  const marker = object.getObjectByName('axis_blender_x') as Mesh;
  (marker.material as MeshStandardMaterial).color.setRGB(0.8, 0.8, 0.8);
  expect(() => inspectFixture(object)).toThrow(/lost its red material/);
});

test('frame timing uses a bounded rolling window and does not call CPU intervals GPU time', () => {
  const timing = new FrameTimings(3);
  for (const sample of [1000, 10, 20, 30, NaN, 0, -1]) timing.record(sample);
  expect(timing.snapshot()).toMatchObject({ sampleCount: 3, meanFrameMs: 20, fps: 50, medianFrameMs: 20, p95FrameMs: 30, maxFrameMs: 30, gpuTiming: 'not measured' });
  timing.reset();
  expect(timing.snapshot()).toMatchObject({ sampleCount: 0, fps: 0, meanFrameMs: 0 });
});
