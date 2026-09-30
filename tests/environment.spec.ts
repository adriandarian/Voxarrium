import { expect, test } from '@playwright/test';
import { BoxGeometry, Color, DirectionalLight, HemisphereLight, InstancedMesh, LineSegments, Mesh, MeshStandardMaterial, Scene, Texture } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { createEnvironment, setEnvironment, stepEnvironment } from '../src/simulation/environment';
import type { TimeOfDay, Weather } from '../src/simulation/environment';
import { createEnvironmentPresentation } from '../src/render/environment';
import { FIXED_DT } from '../src/simulation/types';

test('default environment preserves the accepted clear-day rural lighting', () => {
  const state = createEnvironment();
  expect(state).toMatchObject({ version: 1, weather: 'clear', timeOfDay: 'day', time: 0, rain: 0, wetness: 0,
    lighting: { sunPosition: { x: -30, y: 65, z: 24 }, sunIntensity: 2.75, fillIntensity: 1.85 } });
  const sky = state.lighting.skyColor;
  expect(new Color(sky.r, sky.g, sky.b).getHex()).toBe(0xc8dae1);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});

test('weather transitions are deterministic and survive serialization while blending', () => {
  const a = createEnvironment(), b = createEnvironment();
  setEnvironment(a, 'rain', 'dusk'); setEnvironment(b, 'rain', 'dusk');
  for (let i = 0; i < 110; i++) { stepEnvironment(a, FIXED_DT); stepEnvironment(b, FIXED_DT); }
  const restored = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 490; i++) {
    stepEnvironment(a, FIXED_DT); stepEnvironment(b, FIXED_DT); stepEnvironment(restored, FIXED_DT);
  }
  expect(a).toEqual(b); expect(restored).toEqual(a);
  expect(a.transition).toBeNull(); expect(a.rain).toBe(1); expect(a.wetness).toBeCloseTo(1);
  expect(a.time).toBeCloseTo(10);
});

test('changing a target mid-transition has no discontinuity and reaches bounded finite presets', () => {
  const state = createEnvironment();
  for (const weather of ['clear', 'cloudy', 'rain'] as Weather[]) for (const timeOfDay of ['day', 'dusk', 'night'] as TimeOfDay[]) {
    const before = structuredClone(state);
    setEnvironment(state, weather, timeOfDay);
    expect(state.lighting).toEqual(before.lighting);
    expect(state.wind).toBe(before.wind); expect(state.rain).toBe(before.rain);
    for (let i = 0; i < 40; i++) {
      stepEnvironment(state, FIXED_DT);
      for (const value of [state.wind, state.cloudiness, state.rain, state.wetness]) {
        expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
      }
      expect(state.lighting.sunIntensity).toBeGreaterThanOrEqual(0.1);
      expect(state.lighting.fillIntensity).toBeGreaterThanOrEqual(0.6);
      expect(state.lighting.sunPosition.y).toBeGreaterThanOrEqual(27);
      for (const color of [state.lighting.skyColor, state.lighting.sunColor, state.lighting.fillColor, state.lighting.groundColor]) {
        expect(Object.values(color).every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
      }
    }
  }
  for (let i = 0; i < 250; i++) stepEnvironment(state, FIXED_DT);
  expect(state.transition).toBeNull(); expect(state.timeOfDay).toBe('night'); expect(state.rain).toBe(1);
});

test('environment does not advance without a simulation tick and rejects invalid deltas', () => {
  const state = createEnvironment(); setEnvironment(state, 'rain', 'night');
  const paused = structuredClone(state);
  for (const dt of [0, -1, NaN, Infinity]) stepEnvironment(state, dt);
  expect(state).toEqual(paused);
  stepEnvironment(state, 60);
  expect(state.time).toBe(0.1); expect(state.transition!.elapsed).toBe(0.1);
  const before = state.time;
  setEnvironment(state, 'cloudy', 'dusk', true);
  expect(state.time).toBe(before); expect(state.rain).toBe(0); expect(state.transition).toBeNull();
  expect(() => setEnvironment(state, 'storm' as Weather, 'day')).toThrow(/Unknown/);
});

test('wetness builds with rain and dries after the rain transition ends', () => {
  const state = createEnvironment(); setEnvironment(state, 'rain', 'day');
  for (let i = 0; i < 600; i++) stepEnvironment(state, FIXED_DT);
  expect(state.wetness).toBeCloseTo(1);
  setEnvironment(state, 'clear', 'day');
  for (let i = 0; i < 360; i++) stepEnvironment(state, FIXED_DT);
  expect(state.rain).toBe(0); expect(state.wetness).toBeGreaterThan(0.85); expect(state.wetness).toBeLessThan(1);
  for (let i = 0; i < 3_600; i++) stepEnvironment(state, FIXED_DT);
  expect(state.wetness).toBe(0);
});

function sceneFixture() {
  const scene = new Scene(), sun = new DirectionalLight(), fill = new HemisphereLight();
  const geometry = new BoxGeometry(1, 9, 1); geometry.translate(0, 4.5, 0);
  const material = new MeshStandardMaterial({ color: 0x718149, roughness: 0.96, vertexColors: true });
  material.name = 'rural.library.vertex-pigment'; material.map = new Texture();
  const trees = new InstancedMesh(geometry, material, 3); trees.name = 'rural.instances.tree-oak-0';
  const roof = new Mesh(new BoxGeometry(8.4, 1, 7.4), new MeshStandardMaterial({ color: 0xa9512b, roughness: 0.86 }));
  roof.name = 'cottage-roof'; roof.position.set(0, 9, -7);
  scene.add(trees, roof, sun, fill);
  return { scene, sun, fill, trees, roof, material, geometry };
}

test('presentation keeps source geometry, instance transforms, maps and colors and restores material ownership', () => {
  const fixture = sceneFixture();
  const positions = Array.from(fixture.geometry.getAttribute('position').array);
  const matrices = Array.from(fixture.trees.instanceMatrix.array);
  let textureDisposed = 0, sourceDisposed = 0, replacementDisposed = 0;
  fixture.material.map!.addEventListener('dispose', () => textureDisposed++);
  fixture.material.addEventListener('dispose', () => sourceDisposed++);
  const presentation = createEnvironmentPresentation(fixture.scene, fixture.sun, fixture.fill);
  const material = fixture.trees.material as unknown as MeshStandardNodeMaterial;
  expect(material.isMeshStandardNodeMaterial).toBe(true); expect(material.positionNode).not.toBeNull();
  expect(material.map).toBe(fixture.material.map); expect(material.color).toEqual(fixture.material.color);
  expect(material.vertexColors).toBe(fixture.material.vertexColors);
  material.addEventListener('dispose', () => replacementDisposed++);
  const state = createEnvironment();
  presentation.update(state, { x: 0, y: 4, z: -1 }, false);
  expect(fixture.sun.intensity).toBe(2.75); expect(fixture.sun.position.toArray()).toEqual([-30, 65, 24]);
  expect(fixture.fill.intensity).toBe(1.85); expect((fixture.scene.background as Color).getHex()).toBe(0xc8dae1);
  setEnvironment(state, 'rain', 'night', true); presentation.update(state, { x: 0, y: 4, z: -1 }, false);
  expect(material.color.r).toBeLessThan(fixture.material.color.r);
  expect(fixture.geometry.getAttribute('position').array).toEqual(new Float32Array(positions));
  expect(fixture.trees.instanceMatrix.array).toEqual(new Float32Array(matrices));
  expect(presentation.stats()).toMatchObject({ windBatches: 1, windInstances: 3, weather: 'rain', timeOfDay: 'night' });
  presentation.dispose(); presentation.dispose();
  expect(fixture.trees.material).toBe(fixture.material);
  expect(textureDisposed).toBe(0); expect(sourceDisposed).toBe(0); expect(replacementDisposed).toBe(1);
  expect(fixture.scene.getObjectByName('living.environment')).toBeUndefined();
});

test('rain stays inside the slice and above real roof envelopes; reduced presentation uses fewer drops and clouds', () => {
  const fixture = sceneFixture();
  const presentation = createEnvironmentPresentation(fixture.scene, fixture.sun, fixture.fill);
  const state = createEnvironment(); setEnvironment(state, 'rain', 'dusk', true); stepEnvironment(state, FIXED_DT);
  const player = { x: 0, y: 4, z: -1 };
  const frozenState = structuredClone(state);
  presentation.update(state, player, false);
  const full = presentation.stats();
  expect(full.rainDrops).toBe(720); expect(full.rainColumnsClippedByShelter).toBeGreaterThan(0);
  const rain = fixture.scene.getObjectByName('living.rain') as LineSegments;
  const positions = rain.geometry.getAttribute('position');
  let underRoof = 0;
  for (let i = 0; i < full.rainDrops * 2; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    expect(Math.abs(x)).toBeLessThan(48); expect(Math.abs(z)).toBeLessThan(48);
    if (Math.abs(x) <= 4.2 && Math.abs(z + 7) <= 3.7) { expect(y).toBeGreaterThanOrEqual(9.62 - 1e-6); underRoof++; }
  }
  expect(underRoof).toBeGreaterThan(0);
  const frozenPositions = Array.from(positions.array);
  presentation.update(state, player, false);
  expect(Array.from(positions.array)).toEqual(frozenPositions); expect(state).toEqual(frozenState);
  presentation.update(state, player, true);
  expect(presentation.stats()).toMatchObject({ reduced: true, rainDrops: 216, cloudLobes: 24 });
  presentation.update(state, { x: 47, y: 0, z: 47 }, false);
  expect(presentation.stats().rainColumnsSkippedOutsideBounds).toBeGreaterThan(0);
  for (let i = 0; i < presentation.stats().rainDrops * 2; i++) {
    expect(Math.abs(positions.getX(i))).toBeLessThan(48); expect(Math.abs(positions.getZ(i))).toBeLessThan(48);
  }
  expect(() => JSON.stringify(presentation.stats())).not.toThrow();
  presentation.dispose();
});
