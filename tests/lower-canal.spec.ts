import { expect, test } from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createCityBlueprint } from '../src/simulation/city-blueprint';
import { createCityWorld } from '../src/simulation/city-world';
import { createLowerCanal } from '../src/simulation/lower-canal';
import { createPhysics } from '../src/physics/physics';
import { createState } from '../src/simulation/state';
import { createCameraRig } from '../src/cameras/cameras';
import { FIXED_DT, IDLE_INPUT } from '../src/simulation/types';
import { urbanCorners, urbanFloorAt, urbanLotFits, urbanSegmentDistance } from '../src/simulation/urban-grammar';
import type { UrbanBuilding } from '../src/simulation/urban-contracts';
import type { Vec3 } from '../src/simulation/types';

const blueprint = createCityBlueprint();
const canal = createLowerCanal(blueprint);
const supported = { ...blueprint, terrain: [...blueprint.terrain, ...canal.surfaces] };
const sample = (a: Vec3, b: Vec3, spacing = .45) => {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  });
};
function parcelDistance(at: Vec3, b: UrbanBuilding) {
  const dx = at.x - b.position.x, dz = at.z - b.position.z;
  const x = Math.cos(b.yaw) * dx - Math.sin(b.yaw) * dz;
  const z = Math.sin(b.yaw) * dx + Math.cos(b.yaw) * dz;
  return Math.hypot(Math.max(0, Math.abs(x) - b.width / 2), Math.max(0, Math.abs(z) - b.depth / 2));
}
function overlap(a: UrbanBuilding, b: UrbanBuilding, margin = .25) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  const ac = urbanCorners(a, margin), bc = urbanCorners(b, margin);
  return axes.every(yaw => {
    const ap = ac.map(p => p.x * Math.cos(yaw) - p.z * Math.sin(yaw));
    const bp = bc.map(p => p.x * Math.cos(yaw) - p.z * Math.sin(yaw));
    return Math.min(...ap) < Math.max(...bp) && Math.min(...bp) < Math.max(...ap);
  });
}

test('Lower Canal is deterministic, serializable and leaves the accepted city data unchanged', () => {
  const before = JSON.stringify(blueprint);
  expect(createLowerCanal(blueprint)).toEqual(canal);
  expect(JSON.stringify(blueprint)).toBe(before);
  expect(JSON.parse(JSON.stringify(canal))).toEqual(canal);
  expect(canal.id).toBe('lower-canal');
  expect(new Set(canal.buildings.map(b => b.id)).size).toBe(canal.buildings.length);
  expect(canal.assumptions.some(a => a.includes('water datum'))).toBe(true);
});

test('the working waterfront has narrow homes, low workshops, separate compound wings and an authored guild', () => {
  expect(canal.buildings.length).toBeGreaterThanOrEqual(35);
  expect(canal.buildings.length).toBeLessThanOrEqual(55);
  expect(new Set(canal.buildings.map(b => b.position.y))).toEqual(new Set([4, 8]));
  expect(new Set(canal.buildings.map(b => b.recipe))).toEqual(new Set(['canal-house', 'workshop-house', 'storehouse', 'water-guild']));
  expect(canal.buildings.filter(b => b.recipe === 'canal-house').length).toBeGreaterThan(15);
  expect(canal.buildings.filter(b => b.recipe === 'workshop-house').length).toBeGreaterThan(10);
  expect(canal.buildings.filter(b => b.id.includes('wing')).length).toBeGreaterThanOrEqual(5);
  expect(canal.buildings.filter(b => b.hero)).toHaveLength(1);
  const guild = canal.buildings.find(b => b.hero)!;
  expect(guild.recipe).toBe('water-guild'); expect(guild.position.y).toBe(8);
  expect(guild.roofColor).toBe(0x3b7470);
  for (const b of canal.buildings.filter(b => b.recipe !== 'water-guild')) {
    expect(b.width).toBeLessThanOrEqual(10.5); expect(b.depth).toBeLessThanOrEqual(11.5);
    expect(b.floors).toBeLessThanOrEqual(3);
    expect(b.roof).not.toBe('mansard');
  }
  expect(canal.stalls.length).toBeLessThanOrEqual(3);
  expect(canal.ambience.workshop).toBeGreaterThan(canal.ambience.market);
  expect(canal.ambience.river).toBeGreaterThan(canal.ambience.market);
});

test('every parcel is supported without overlapping another parcel or the protected macro lanes', () => {
  const failures: string[] = [];
  for (const [i, b] of canal.buildings.entries()) {
    if (!urbanLotFits(blueprint, b)) failures.push(`${b.id}: unsupported footprint or macro road intrusion`);
    for (const other of canal.buildings.slice(i + 1)) if (overlap(b, other)) failures.push(`${b.id}: overlaps ${other.id}`);
    const corners = urbanCorners(b, .2);
    const boundary = [...corners, b.position];
    for (const x of [-.5, 0, .5]) for (const z of [-.5, 0, .5]) boundary.push({
      x: b.position.x + Math.cos(b.yaw) * x * b.width + Math.sin(b.yaw) * z * b.depth,
      y: b.position.y,
      z: b.position.z - Math.sin(b.yaw) * x * b.width + Math.cos(b.yaw) * z * b.depth,
    });
    for (const at of boundary) if (Math.abs((urbanFloorAt(blueprint, at.x, at.z) ?? -999) - b.position.y) > .08)
      failures.push(`${b.id}: terrace level changes inside footprint at ${JSON.stringify(at)}`);
  }
  expect(failures).toEqual([]);
});

test('quay entries and local paths have ground support, a clear walking center and preserve accepted water', () => {
  const failures: string[] = [];
  let checked = 0;
  for (const street of canal.streets) for (let i = 1; i < street.points.length; i++) {
    for (const at of sample(street.points[i - 1]!, street.points[i]!)) {
      const floor = urbanFloorAt(supported, at.x, at.z);
      if (floor === null || Math.abs(floor - at.y) > .12) failures.push(`${street.id}: no support at ${JSON.stringify(at)}`);
      for (const b of canal.buildings) if (parcelDistance(at, b) < .45) failures.push(`${street.id}: blocked by ${b.id}`);
      checked++;
    }
  }
  for (const surface of canal.surfaces) for (let i = 0; i < surface.vertices.length; i += 3) {
    const at = { x: surface.vertices[i]!, y: surface.vertices[i + 1]!, z: surface.vertices[i + 2]! };
    if (surface.id.includes('cargo-dock')) { expect(at.y).toBeGreaterThanOrEqual(.6); continue; }
    for (const water of blueprint.waterways) for (let j = 1; j < water.points.length; j++)
      if (urbanSegmentDistance(at, water.points[j - 1]!, water.points[j]!) < water.width / 2 + 1)
        failures.push(`${surface.id}: intrudes into ${water.id}`);
  }
  expect(checked).toBeGreaterThan(1000);
  expect(failures).toEqual([]);
  expect(canal.route[0]).toEqual({ x: 310, y: 4, z: -165 });
  expect(canal.route.at(-1)).toEqual(canal.route[0]);
  for (let i = 1; i < canal.route.length; i++) for (const at of sample(canal.route[i - 1]!, canal.route[i]!)) {
    expect(Math.abs((urbanFloorAt(supported, at.x, at.z) ?? -999) - at.y), JSON.stringify(at)).toBeLessThanOrEqual(.21);
    expect(canal.buildings.every(b => parcelDistance(at, b) >= .45), JSON.stringify(at)).toBe(true);
  }
});

test('residents and waterside workers have supported connected routines and safe shelter approaches', () => {
  expect(canal.npcs.definitions).toHaveLength(20);
  expect(new Set(canal.npcs.definitions.map(n => n.id)).size).toBe(20);
  expect(canal.npcs.definitions.some(n => n.name.includes('waterside worker'))).toBe(true);
  const adjacency = new Map(Object.keys(canal.npcs.nodes).map(id => [id, new Set<string>()]));
  const failures: string[] = [];
  let checked = 0;
  for (const [from, to] of canal.npcs.edges) {
    expect(adjacency.has(from) && adjacency.has(to)).toBe(true);
    adjacency.get(from)!.add(to); adjacency.get(to)!.add(from);
    for (const at of sample(canal.npcs.nodes[from]!, canal.npcs.nodes[to]!)) {
      const floor = urbanFloorAt(supported, at.x, at.z);
      if (floor === null || Math.abs(floor - at.y + .012) > .12) failures.push(`${from}->${to}: unsupported feet at ${JSON.stringify(at)}`);
      for (const b of canal.buildings) if (parcelDistance(at, b) < .40) failures.push(`${from}->${to}: blocked by ${b.id}`);
      checked++;
    }
  }
  const reached = new Set<string>(), pending = [Object.keys(canal.npcs.nodes)[0]!];
  while (pending.length) { const id = pending.pop()!; if (reached.has(id)) continue; reached.add(id); pending.push(...adjacency.get(id)!); }
  expect(reached.size).toBe(adjacency.size);
  for (const npc of canal.npcs.definitions) {
    for (const id of [...npc.dayRoute, ...npc.duskRoute, npc.shelterNode]) expect(reached.has(id)).toBe(true);
    expect(npc.dialogue.length).toBeGreaterThan(40);
    expect(npc.rainDialogue).not.toBe(npc.dialogue);
    expect(npc.walkSpeed).toBeGreaterThan(0);
  }
  expect(checked).toBeGreaterThan(1700);
  expect(failures).toEqual([]);
});

test('Lower Canal NPC capsules clear actual M7 solids, doorway thresholds and resident retaining geometry', async () => {
  await RAPIER.init();
  const course = createCityWorld(true).course, world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const ids = new Map<number, string>();
  for (const surface of course.surfaces ?? []) {
    const c = world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(surface.vertices), new Uint32Array(surface.indices)));
    ids.set(c.handle, surface.id);
  }
  for (const b of course.boxes.filter(b => b.collides)) {
    const sx = Math.sin((b.rotationX ?? 0) / 2), cx = Math.cos((b.rotationX ?? 0) / 2);
    const sy = Math.sin((b.rotationY ?? 0) / 2), cy = Math.cos((b.rotationY ?? 0) / 2);
    const c = world.createCollider(RAPIER.ColliderDesc.cuboid(b.size.x / 2, b.size.y / 2, b.size.z / 2)
      .setTranslation(b.position.x, b.position.y, b.position.z).setRotation({ x: sx * cy, y: cx * sy, z: sx * sy, w: cx * cy }));
    ids.set(c.handle, b.id);
  }
  world.step();
  const failures: string[] = [], shape = new RAPIER.Capsule(.62, .22);
  let checked = 0;
  try {
    for (const spacing of [.25, .3]) for (const [from, to] of canal.npcs.edges) for (const at of sample(canal.npcs.nodes[from]!, canal.npcs.nodes[to]!, spacing)) {
      const hits: string[] = [];
      world.intersectionsWithShape({ ...at, y: at.y + .87 }, { x: 0, y: 0, z: 0, w: 1 }, shape, collider => {
        hits.push(ids.get(collider.handle)!); return true;
      });
      const floor = world.castRayAndGetNormal(new RAPIER.Ray({ ...at, y: at.y + .15 }, { x: 0, y: -1, z: 0 }), .35, true);
      if (hits.length || !floor || floor.normal.y < .94) if (failures.length < 35)
        failures.push(`spacing ${spacing}: ${from}->${to} at ${JSON.stringify(at)}: ${hits.join(',')} floor=${floor?.timeOfImpact}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(2500);
    expect(failures).toEqual([]);
  } finally { world.free(); }
});

for (const mode of ['third-person', 'first-person'] as const)
test(`Lower Canal quay, cargo stairs and service lanes traverse actual collision in ${mode}`, async () => {
  test.setTimeout(120_000);
  const city = createCityWorld(true), physics = await createPhysics(city.course), state = createState(city.course);
  state.paused = false; state.camera.mode = mode;
  const rig = createCameraRig(state, physics, city.blueprint);
  let steps = 0;
  const walk = (target: Vec3) => {
    const start = state.player.position, distance = Math.hypot(target.x - start.x, target.z - start.z);
    const limit = Math.ceil((distance / 5.4 + 5) / FIXED_DT);
    for (let i = 0; i < limit; i++) {
      const dx = target.x - state.player.position.x, dz = target.z - state.player.position.z, d = Math.hypot(dx, dz);
      if (d < .06 && Math.hypot(state.player.velocity.x, state.player.velocity.z) < .1) break;
      state.camera.yaw = Math.atan2(-dx, -dz);
      physics.step(state, { ...IDLE_INPUT, forward: d < .6 ? Math.min(1, d * 2) : 1, run: d > 1.4 }, FIXED_DT);
      if (++steps % 12 === 0) { rig.update(.2, 1.6); expect(rig.camera.position.toArray().every(Number.isFinite)).toBe(true); }
    }
    for (let i = 0; i < 24; i++) physics.step(state, IDLE_INPUT, FIXED_DT);
    expect(Math.hypot(state.player.position.x - target.x, state.player.position.z - target.z),
      JSON.stringify({ target, actual: state.player.position })).toBeLessThan(.18);
    expect(Math.abs(state.player.position.y - target.y)).toBeLessThan(.16);
    expect(state.player.grounded).toBe(true);
  };
  try {
    const paths = [canal.route, ...canal.streets.map(s => s.points)];
    for (const path of paths) {
      physics.reset(state, path[0]!); for (let i = 0; i < 24; i++) physics.step(state, IDLE_INPUT, FIXED_DT);
      const resets = state.resets; for (const target of path.slice(1)) walk(target);
      expect(state.resets).toBe(resets);
    }
    const doors = city.entrances.filter(e => e.buildingId.startsWith('m7.lower-canal.'));
    const failures: string[] = [];
    for (const door of doors) {
      const approach = { x: door.position.x + Math.sin(door.yaw) * 1.1, y: door.position.y,
        z: door.position.z + Math.cos(door.yaw) * 1.1 };
      physics.reset(state, approach); for (let i = 0; i < 24; i++) physics.step(state, IDLE_INPUT, FIXED_DT);
      const resets = state.resets;
      try { walk(door.position); expect(state.resets).toBe(resets); }
      catch { failures.push(`${door.id}: target ${JSON.stringify(door.position)} actual ${JSON.stringify(state.player.position)}`); }
    }
    expect(doors.length).toBeGreaterThan(canal.buildings.length);
    expect(failures).toEqual([]);
    await test.info().attach('lower-canal-route', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      mode, paths: paths.length, doors: doors.length, steps, jumps: 0, isolatedPathSetups: paths.length, isolatedDoorSetups: doors.length,
    })) });
  } finally { rig.dispose(); physics.dispose(); }
});
