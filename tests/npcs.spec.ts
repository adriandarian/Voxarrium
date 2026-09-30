import { expect, test } from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Mesh, Sprite, Vector3 } from 'three';
import {
  createPopulation, nearestNpc, npcDialogue, NPC_DEFINITIONS, NPC_ROUTE_EDGES,
  NPC_ROUTE_NODES, stepPopulation,
} from '../src/simulation/npcs';
import type { NpcEnvironment, NpcState } from '../src/simulation/npcs';
import { createRuralCourse } from '../src/simulation/rural';
import { createNpcPresentation } from '../src/render/npcs';
import type { Vec3 } from '../src/simulation/types';

const day: NpcEnvironment = { weather: 'clear', timeOfDay: 'day' };
const rain: NpcEnvironment = { weather: 'rain', timeOfDay: 'day' };
const distantPlayer: Vec3 = { x: -30, y: 4.012, z: -25 };
const separation = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function advance(population: NpcState[], seconds: number, environment = day) {
  for (let step = 0; step < seconds * 60; step++) stepPopulation(population, 1 / 60, environment, distantPlayer);
}

test('six authored local identities create independent, deterministic serializable state', () => {
  const population = createPopulation();
  expect(population).toHaveLength(6);
  expect(new Set(population.map(npc => npc.id)).size).toBe(6);
  expect(population.map(npc => npc.id)).toEqual(NPC_DEFINITIONS.map(definition => definition.id));
  expect(JSON.parse(JSON.stringify(population))).toEqual(createPopulation());
  population[0]!.position.x = 900;
  expect(createPopulation()[0]!.position.x).not.toBe(900);
  for (const definition of NPC_DEFINITIONS) {
    expect(definition.name.length).toBeGreaterThan(4);
    expect(definition.dialogue.length).toBeGreaterThan(30);
    expect(NPC_ROUTE_NODES[definition.shelterNode]).toBeTruthy();
  }
});

test('daily routes and mid-segment save roundtrip continue deterministically', () => {
  const original = createPopulation();
  advance(original, 12);
  expect(original.some(npc => npc.nextNodeId !== null)).toBe(true);
  const restored = JSON.parse(JSON.stringify(original)) as NpcState[];
  for (const environment of [day, { weather: 'cloudy', timeOfDay: 'dusk' } as const, rain, { weather: 'clear', timeOfDay: 'night' } as const, day]) {
    advance(original, 45, environment);
    advance(restored, 45, environment);
    expect(restored).toEqual(original);
  }
  expect(original.every(npc => npc.distanceTravelled > 20)).toBe(true);
  expect(original.every(npc => Number.isFinite(npc.heading + npc.speed))).toBe(true);
});

test('rain and night routes reach real eaves and resume without a teleport', () => {
  const population = createPopulation();
  advance(population, 17);
  const beforeRain = population.map(npc => ({ ...npc.position }));
  stepPopulation(population, 1 / 60, rain, distantPlayer);
  for (let i = 0; i < population.length; i++) expect(separation(population[i]!.position, beforeRain[i]!)).toBeLessThan(0.02);
  advance(population, 70, rain);
  for (const [index, definition] of NPC_DEFINITIONS.entries()) {
    const npc = population[index]!;
    expect(npc.mode, definition.id).toBe('sheltered');
    expect(npc.position, definition.id).toEqual(NPC_ROUTE_NODES[definition.shelterNode]);
    expect(npc.nextNodeId).toBeNull();
    expect(npc.speed).toBe(0);
    // Existing cottage roof spans world z=-10.67..-3.33.
    expect(npc.position.z).toBeGreaterThan(-10.67);
    expect(npc.position.z).toBeLessThan(-3.33);
  }
  const sheltered = population.map(npc => ({ ...npc.position }));
  advance(population, 2, { weather: 'clear', timeOfDay: 'night' });
  expect(population.every(npc => npc.mode === 'resting')).toBe(true);
  expect(population.map(npc => npc.position)).toEqual(sheltered);
  stepPopulation(population, 1 / 60, day, distantPlayer);
  for (let i = 0; i < population.length; i++) expect(separation(population[i]!.position, sheltered[i]!)).toBeLessThan(0.02);
  advance(population, 35);
  expect(population.every((npc, index) => separation(npc.position, sheltered[index]!) > 0.5)).toBe(true);
});

test('interaction pauses an in-progress segment and looks toward the player', () => {
  const population = createPopulation();
  advance(population, 13);
  const npc = population.find(local => local.nextNodeId !== null && separation(local.position, NPC_ROUTE_NODES[local.nextNodeId]!) > 0.2)!;
  const position = { ...npc.position };
  const nextNode = npc.nextNodeId;
  const player = { x: position.x + 1, y: position.y, z: position.z };
  for (let step = 0; step < 120; step++) stepPopulation(population, 1 / 60, day, player, npc.id);
  expect(npc.mode).toBe('talking');
  expect(npc.position).toEqual(position);
  expect(npc.nextNodeId).toBe(nextNode);
  expect(npc.speed).toBe(0);
  expect(Math.atan2(Math.sin(npc.heading + Math.PI / 2), Math.cos(npc.heading + Math.PI / 2))).toBeCloseTo(0, 3);
  stepPopulation(population, 1 / 60, day, player);
  expect(npc.mode).toBe('walking');
  expect(separation(npc.position, position)).toBeGreaterThan(0);
  expect(separation(npc.position, position)).toBeLessThan(0.02);
});

test('nearest interaction respects distance and elevation; text is locally authored per environment', () => {
  const npc = createPopulation()[0]!;
  npc.position = { x: 0, y: 4, z: 0 };
  expect(nearestNpc([npc], { x: 2.4, y: 4, z: 0 })).toBe(npc);
  expect(nearestNpc([npc], { x: 2.40001, y: 4, z: 0 })).toBeNull();
  expect(nearestNpc([npc], { x: 0, y: 0, z: 0 })).toBeNull();
  expect(nearestNpc([npc], npc.position, -1)).toBeNull();
  for (const definition of NPC_DEFINITIONS) {
    expect(npcDialogue(definition.id, day)).toEqual({ name: definition.name, text: definition.dialogue });
    expect(npcDialogue(definition.id, rain).text).toBe(definition.rainDialogue);
    expect(npcDialogue(definition.id, { weather: 'cloudy', timeOfDay: 'dusk' }).text).toBe(definition.eveningDialogue);
  }
});

test('every walking/shelter segment clears actual rural Rapier obstacles and has ground support', async () => {
  await RAPIER.init();
  const course = createRuralCourse();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const ids = new Map<number, string>();
  for (const surface of course.surfaces ?? []) {
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(surface.vertices), new Uint32Array(surface.indices)));
    ids.set(collider.handle, surface.id);
  }
  for (const box of course.boxes) {
    if (!box.collides) continue;
    const sx = Math.sin((box.rotationX ?? 0) / 2), cx = Math.cos((box.rotationX ?? 0) / 2);
    const sy = Math.sin((box.rotationY ?? 0) / 2), cy = Math.cos((box.rotationY ?? 0) / 2);
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
      .setTranslation(box.position.x, box.position.y, box.position.z)
      .setRotation({ x: sx * cy, y: cx * sy, z: sx * sy, w: cx * cy }));
    ids.set(collider.handle, box.id);
  }
  world.step();
  try {
    const shape = new RAPIER.Capsule(0.62, 0.22);
    for (const [from, to] of NPC_ROUTE_EDGES) {
      const a = NPC_ROUTE_NODES[from]!, b = NPC_ROUTE_NODES[to]!;
      const samples = Math.ceil(separation(a, b) / 0.12);
      for (let sample = 0; sample <= samples; sample++) {
        const t = sample / samples;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
        const context = `${from} → ${to}, sample ${sample}, ${JSON.stringify(p)}`;
        const overlaps: string[] = [];
        world.intersectionsWithShape({ x: p.x, y: p.y + 0.84, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, shape, collider => {
          overlaps.push(ids.get(collider.handle)!);
          return true;
        });
        expect(overlaps, context).toEqual([]);
        const support = world.castRayAndGetNormal(new RAPIER.Ray({ x: p.x, y: p.y + 0.15, z: p.z }, { x: 0, y: -1, z: 0 }), 0.3, true);
        expect(support, context).not.toBeNull();
        expect(support!.normal.y, context).toBeGreaterThan(0.99);
        expect(p.y + 0.15 - support!.timeOfImpact, context).toBeCloseTo(p.y - 0.012, 4);
      }
    }
  } finally { world.free(); }
});

test('weather changes between nodes keep bounded movement and the authored terrain elevation', () => {
  const population = createPopulation();
  let maximumStep = 0;
  let maximumElevationError = 0;
  for (let frame = 0; frame < 12_000; frame++) {
    const environment: NpcEnvironment = {
      weather: Math.floor(frame / 557) % 2 ? 'rain' : 'clear',
      timeOfDay: Math.floor(frame / 1597) % 3 === 2 ? 'night' : 'day',
    };
    const previous = population.map(npc => ({ ...npc.position }));
    stepPopulation(population, 1 / 60, environment, distantPlayer);
    for (let i = 0; i < population.length; i++) {
      const npc = population[i]!;
      maximumStep = Math.max(maximumStep, separation(npc.position, previous[i]!));
      maximumElevationError = Math.max(maximumElevationError, Math.abs(npc.position.y - 4.012));
    }
  }
  expect(maximumStep).toBeGreaterThan(0);
  expect(maximumStep).toBeLessThan(0.018);
  expect(maximumElevationError).toBeLessThan(0.00001);
});

test('presentation is solid human-scale geometry with shared pigment and reduced distant poses', () => {
  const population = createPopulation();
  const presentation = createNpcPresentation();
  presentation.update(population, 0, population[0]!.position, false);
  const meshes: Mesh[] = [];
  presentation.group.traverse(object => {
    expect(object instanceof Sprite).toBe(false);
    if (object instanceof Mesh) meshes.push(object);
  });
  expect(meshes).toHaveLength(30);
  expect(new Set(meshes.map(mesh => mesh.material)).size).toBe(1);
  expect(presentation.stats().triangles).toBeLessThan(20_000);
  expect(JSON.parse(JSON.stringify(presentation.stats())).dynamicColliders).toBe(0);
  for (const npc of population) {
    const root = presentation.group.getObjectByName(`npc:${npc.id}`)!;
    const size = new Box3().setFromObject(root).getSize(new Vector3());
    expect(size.y).toBeGreaterThan(1.5);
    expect(size.y).toBeLessThan(1.9);
    expect(size.z).toBeGreaterThan(0.3);
  }
  const distant = { x: 100, y: 4, z: 100 };
  presentation.update(population, 1, distant, false);
  const count = presentation.stats().poseUpdates;
  population[0]!.position.x += 0.03;
  population[0]!.heading = 1.2;
  presentation.update(population, 1.05, distant, false);
  expect(presentation.stats().poseUpdates).toBe(count);
  const root = presentation.group.getObjectByName(`npc:${population[0]!.id}`)!;
  expect(root.position.x).toBe(population[0]!.position.x);
  expect(root.rotation.y).toBe(1.2);
  // Mirror the renderer's set-based scene ownership disposal.
  new Set(meshes.map(mesh => mesh.geometry)).forEach(geometry => geometry.dispose());
  const material = meshes[0]!.material;
  if (!Array.isArray(material)) material.dispose();
});
