import { expect, test } from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createDistrictCourse } from '../src/simulation/district';
import { DISTRICT_NPC_DEFINITIONS, DISTRICT_NPC_EDGES, DISTRICT_NPC_NODES } from '../src/simulation/district-npcs';
import { createPopulation, stepPopulation, npcDialogue } from '../src/simulation/npcs';
import type { NpcState, NpcEnvironment } from '../src/simulation/npcs';
import { createState } from '../src/simulation/state';
import { footstepSurface } from '../src/audio/audio';
const player = { x: 89, y: 4.012, z: -12 };
const day: NpcEnvironment = { weather: 'clear', timeOfDay: 'day' };
function advance(population: NpcState[], seconds: number, environment: NpcEnvironment) {
  for (let i = 0; i < seconds * 60; i++) stepPopulation(population, 1 / 60, environment, player);
}

test('district has 42 stable locals with independent routines and local dialogue', () => {
  const state = createState(createDistrictCourse());
  expect(state.population).toHaveLength(42);
  expect(new Set(state.population.map(n => n.id)).size).toBe(42);
  expect(state.environment).not.toBeNull();
  expect(DISTRICT_NPC_DEFINITIONS).toHaveLength(36);
  expect(new Set(DISTRICT_NPC_DEFINITIONS.map(d => d.initialWait)).size).toBe(36);
  advance(state.population, 20, day);
  const locals = state.population.filter(n => n.id.startsWith('district.'));
  expect(new Set(locals.map(n => `${n.mode}:${n.wait.toFixed(3)}:${n.distanceTravelled.toFixed(3)}`)).size).toBeGreaterThan(20);
  for (const definition of DISTRICT_NPC_DEFINITIONS) {
    expect(npcDialogue(definition.id, day).text.length).toBeGreaterThan(40);
    expect(npcDialogue(definition.id, { weather: 'rain', timeOfDay: 'day' }).text).not.toBe(definition.dialogue);
  }
  expect(footstepSurface({ x: 96, y: 0.08, z: 19 })).toBe('wood');
});

test('all district walking and shelter edges clear actual collision with ground support', async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const course = createDistrictCourse();
  const ids = new Map<number, string>();
  for (const surface of course.surfaces ?? []) {
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(surface.vertices), new Uint32Array(surface.indices)));
    ids.set(collider.handle, surface.id);
  }
  for (const box of course.boxes.filter(b => b.collides)) {
    const sx = Math.sin((box.rotationX ?? 0) / 2), cx = Math.cos((box.rotationX ?? 0) / 2);
    const sy = Math.sin((box.rotationY ?? 0) / 2), cy = Math.cos((box.rotationY ?? 0) / 2);
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
      .setTranslation(box.position.x, box.position.y, box.position.z)
      .setRotation({ x: sx * cy, y: cx * sy, z: sx * sy, w: cx * cy }));
    ids.set(collider.handle, box.id);
  }
  world.step();
  const failures: string[] = [];
  let samples = 0;
  try {
    const shape = new RAPIER.Capsule(0.62, 0.22);
    for (const [from, to] of DISTRICT_NPC_EDGES) {
      const a = DISTRICT_NPC_NODES[from]!, b = DISTRICT_NPC_NODES[to]!;
      const count = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.14));
      for (let i = 0; i <= count; i++) {
        const t = i / count, p = { x: a.x + (b.x - a.x) * t, y: a.y, z: a.z + (b.z - a.z) * t };
        const overlaps: string[] = [];
        world.intersectionsWithShape({ ...p, y: p.y + 0.84 }, { x: 0, y: 0, z: 0, w: 1 }, shape, collider => {
          overlaps.push(ids.get(collider.handle)!); return true;
        });
        const support = world.castRayAndGetNormal(new RAPIER.Ray({ ...p, y: p.y + 0.15 }, { x: 0, y: -1, z: 0 }), 0.3, true);
        if (overlaps.length || !support || support.normal.y < 0.99 || Math.abs(p.y + 0.15 - support.timeOfImpact - (p.y - 0.012)) > 0.002) {
          if (failures.length < 20) failures.push(`${from}->${to} at ${JSON.stringify(p)}: ${overlaps.join(',')}, support=${support?.timeOfImpact}`);
        }
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(3000);
    expect(failures).toEqual([]);
  } finally { world.free(); }
});

test('district rain/night shelter and JSON continuation do not teleport or duplicate locals', () => {
  const population = createPopulation(true);
  advance(population, 19, day);
  const restored: NpcState[] = JSON.parse(JSON.stringify(population));
  let maximumMove = 0;
  for (const environment of [day, { weather: 'rain', timeOfDay: 'day' } as const, { weather: 'clear', timeOfDay: 'night' } as const, day]) {
    for (let frame = 0; frame < 9000; frame++) {
      const before = population.map(n => ({ ...n.position }));
      stepPopulation(population, 1 / 60, environment, player);
      stepPopulation(restored, 1 / 60, environment, player);
      for (let i = 0; i < population.length; i++) maximumMove = Math.max(maximumMove,
        Math.hypot(population[i]!.position.x - before[i]!.x, population[i]!.position.z - before[i]!.z));
    }
    expect(restored).toEqual(population);
    if (environment.weather === 'rain') expect(population.every(n => n.mode === 'sheltered')).toBe(true);
    if (environment.timeOfDay === 'night') expect(population.every(n => n.mode === 'resting')).toBe(true);
  }
  expect(maximumMove).toBeGreaterThan(0);
  expect(maximumMove).toBeLessThan(0.02);
  expect(population.every(n => n.distanceTravelled > 10)).toBe(true);
});
