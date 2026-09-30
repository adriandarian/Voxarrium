import { expect, test } from '@playwright/test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createCameraRig } from '../src/cameras/cameras';
import { createPhysics } from '../src/physics/physics';
import type { Physics } from '../src/physics/physics';
import { createDistrictCourse, DISTRICT_ENTRANCES } from '../src/simulation/district';
import { DISTRICT, DISTRICT_BUILDINGS, DISTRICT_ROUTE, DISTRICT_STREETS } from '../src/simulation/district-layout';
import { createRuralCourse } from '../src/simulation/rural';
import { FIXED_DT, IDLE_INPUT, PLAYER } from '../src/simulation/types';
import type { CourseSpec, GameState, InputFrame, Vec3 } from '../src/simulation/types';

const course = createDistrictCourse();
const walking = { ...IDLE_INPUT, forward: 1 };
const rotation = { x: 0, y: 0, z: 0, w: 1 };
let physics: Physics;
let state: GameState;

function advance(frames: number, input: InputFrame = IDLE_INPUT) {
  for (let frame = 0; frame < frames; frame++) physics.step(state, input, FIXED_DT);
}
function place(position: Vec3, yaw = 0) {
  physics.reset(state, position);
  state.camera.yaw = yaw;
  advance(24);
}
function nearestStreetPoint(position: Vec3): Vec3 {
  let best: Vec3 | undefined;
  let bestDistance = Infinity;
  for (const street of DISTRICT_STREETS) {
    for (let index = 1; index < street.points.length; index++) {
      const a = street.points[index - 1]!, b = street.points[index]!;
      if (Math.abs(a.y - position.y) > 1.3) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / (dx * dx + dz * dz)));
      const p = { x: a.x + dx * t, y: a.y + 0.04, z: a.z + dz * t };
      const distance = Math.hypot(position.x - p.x, position.z - p.z);
      if (distance < bestDistance) { bestDistance = distance; best = p; }
    }
  }
  if (!best) throw new Error('Entrance has no same-level street approach.');
  return best;
}
function collisionWorld(spec: CourseSpec) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const ids = new Map<number, string>();
  for (const surface of spec.surfaces ?? []) {
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(surface.vertices), new Uint32Array(surface.indices)));
    ids.set(collider.handle, surface.id);
  }
  for (const box of spec.boxes) {
    if (!box.collides) continue;
    const sx = Math.sin((box.rotationX ?? 0) / 2), cx = Math.cos((box.rotationX ?? 0) / 2);
    const sy = Math.sin((box.rotationY ?? 0) / 2), cy = Math.cos((box.rotationY ?? 0) / 2);
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
      .setTranslation(box.position.x, box.position.y, box.position.z)
      .setRotation({ x: sx * cy, y: cx * sy, z: sx * sy, w: cx * cy }));
    ids.set(collider.handle, box.id);
  }
  world.step();
  return {
    world,
    overlaps(position: Vec3, shape: RAPIER.Shape) {
      const found: string[] = [];
      world.intersectionsWithShape(position, rotation, shape, collider => {
        found.push(ids.get(collider.handle)!);
        return true;
      });
      return found;
    },
    support(position: Vec3) {
      const hit = world.castRayAndGetNormal(new RAPIER.Ray({ x: position.x, y: position.y + 3, z: position.z }, { x: 0, y: -1, z: 0 }), 4, true);
      return hit && { y: position.y + 3 - hit.timeOfImpact, normal: hit.normal };
    },
  };
}

test.beforeEach(async () => {
  physics = await createPhysics(course);
  state = {
    sceneId: course.id, seed: course.seed, tick: 0, elapsed: 0, paused: false, resets: 0,
    environment: null, population: [], interaction: null,
    player: { position: { ...course.spawn }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, heading: 0 },
    camera: { mode: 'third-person', yaw: 0, pitch: -0.1, debugPosition: { x: 0, y: 25, z: 30 } },
  };
});
test.afterEach(() => physics.dispose());

test('district data is deterministic, serializable and preserves the accepted rural collision', () => {
  const rural = createRuralCourse();
  expect(JSON.parse(JSON.stringify(course))).toEqual(createDistrictCourse());
  expect(course.id).toBe(DISTRICT.id);
  expect(course.boxes.slice(0, rural.boxes.length)).toEqual(rural.boxes);
  expect(course.surfaces!.slice(0, rural.surfaces!.length)).toEqual(rural.surfaces);
  expect(course.spawn).toEqual(course.bookmarks.primaryStreet!.position);
  expect(course.bookmarks.spawn).toEqual(course.bookmarks.primaryStreet);
  expect(course.bookmarks.ruralSpawn).toEqual(rural.bookmarks.spawn);
  for (const [id, bookmark] of Object.entries(rural.bookmarks)) if (id !== 'spawn') expect(course.bookmarks[id]).toEqual(bookmark);
  const features = [...course.boxes, ...course.surfaces!];
  expect(new Set(features.map(feature => feature.id)).size).toBe(features.length);
  for (const surface of course.surfaces!) {
    expect(surface.vertices.every(Number.isFinite), surface.id).toBe(true);
    expect(surface.indices.every(index => Number.isInteger(index) && index >= 0 && index < surface.vertices.length / 3), surface.id).toBe(true);
  }
  expect(DISTRICT_BUILDINGS).toHaveLength(27);
  for (const building of DISTRICT_BUILDINGS) {
    const collider = course.boxes.find(box => box.id === `${building.id}.collider`)!;
    expect(collider.size).toEqual({ x: building.width, y: building.floors * building.floorHeight, z: building.depth });
    expect(collider.rotationY).toBe(building.yaw);
    expect(collider.position.y - collider.size.y / 2).toBeCloseTo(building.position.y, 10);
    expect(collider.visible).toBe(false);
  }
});

test('district review bookmarks settle onto supported geometry without a reset', () => {
  for (const name of ['primaryStreet', 'alley', 'market', 'canal', 'civic', 'southQuay', 'ruralEdge']) {
    const bookmark = course.bookmarks[name]!;
    place(bookmark.position, bookmark.yaw);
    expect(state.player.grounded, name).toBe(true);
    expect(state.player.position.y, name).toBeCloseTo(bookmark.position.y - 0.025, 2);
  }
});

test('every street supports its full authored width and both follow-camera directions', async () => {
  const staticWorld = collisionWorld(course);
  const capsule = new RAPIER.Capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius);
  const cameraBall = new RAPIER.Ball(0.27);
  const cameraRig = createCameraRig(state, physics);
  const failures: string[] = [];
  let samples = 0;
  try {
    for (const street of DISTRICT_STREETS) {
      for (let segment = 1; segment < street.points.length; segment++) {
        const a = street.points[segment - 1]!, b = street.points[segment]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
        const count = Math.ceil(length / 0.2);
        for (let index = 0; index <= count; index++) {
          const t = index / count;
          for (const offset of [0, -street.width / 2 + PLAYER.radius + 0.03, street.width / 2 - PLAYER.radius - 0.03]) {
            const p = { x: a.x + (b.x - a.x) * t - dz * offset, y: a.y + 0.025, z: a.z + (b.z - a.z) * t + dx * offset };
            const context = `${street.id} segment${segment} sample${index} offset${offset.toFixed(2)} ${JSON.stringify(p)}`;
            const overlaps = staticWorld.overlaps({ ...p, y: p.y + PLAYER.height / 2 }, capsule);
            const support = staticWorld.support(p);
            if (overlaps.length || !support || support.normal.y < 0.99 || Math.abs(support.y - a.y) > 0.001) {
              failures.push(`${context}: overlaps ${overlaps}, support ${JSON.stringify(support)}`);
            }
            if (offset === 0) {
              for (const direction of [1, -1]) {
                state.player.position = p;
                state.camera.yaw = Math.atan2(-dx * direction, -dz * direction);
                cameraRig.update(0, 1.6);
                const camera = cameraRig.camera.position;
                const cameraHits = staticWorld.overlaps(camera, cameraBall);
                if (cameraHits.length) failures.push(`${context}: camera direction${direction} ${cameraHits}`);
              }
            }
            samples++;
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(6000);
    const examples = [...new Set(failures.map(failure => failure.split(' segment')[0]))].flatMap(id =>
      failures.filter(failure => failure.startsWith(`${id} segment`)).slice(0, 4));
    expect(examples, `${failures.length} failed street samples`).toEqual([]);
    await test.info().attach('district-street-clearance', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      streetIds: DISTRICT_STREETS.map(street => street.id), capsuleSamples: samples,
      cameraSamples: samples / 3 * 2, failures: failures.length, capsuleRadius: PLAYER.radius,
      capsuleHeight: PLAYER.height, cameraRadius: 0.27, intervalMeters: 0.2,
    }, null, 2)) });
  } finally { cameraRig.dispose(); staticWorld.world.free(); }
});

test('all 27 future entrance hooks are clear and real thresholds climb to closed doors', () => {
  const staticWorld = collisionWorld(course);
  const capsule = new RAPIER.Capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius);
  try {
    for (const [index, building] of DISTRICT_BUILDINGS.entries()) {
      const entrance = DISTRICT_ENTRANCES[index]!;
      expect(entrance.buildingId).toBe(building.id);
      expect(entrance.closed).toBe(true);
      expect(staticWorld.overlaps({ ...entrance.position, y: entrance.position.y + 0.025 + PLAYER.height / 2 }, capsule), entrance.id).toEqual([]);
      const support = staticWorld.support(entrance.position);
      expect(support, entrance.id).not.toBeNull();
      expect(support!.y, entrance.id).toBeCloseTo(building.position.y, 3);
      const approach = {
        x: building.position.x + Math.sin(building.yaw) * (building.depth / 2 + 1.7),
        y: building.position.y + 0.04,
        z: building.position.z + Math.cos(building.yaw) * (building.depth / 2 + 1.7),
      };
      const street = nearestStreetPoint(approach);
      place(street);
      const resets = state.resets;
      const frames = Math.ceil((Math.hypot(approach.x - street.x, approach.z - street.z) / PLAYER.walkSpeed + 4) / FIXED_DT);
      for (let frame = 0; frame < frames; frame++) {
        const dx = approach.x - state.player.position.x, dz = approach.z - state.player.position.z;
        if (Math.hypot(dx, dz) < 0.1) break;
        state.camera.yaw = Math.atan2(-dx, -dz);
        physics.step(state, walking, FIXED_DT);
      }
      advance(24);
      expect(Math.hypot(state.player.position.x - approach.x, state.player.position.z - approach.z), `${building.id} street approach`).toBeLessThan(0.14);
      state.camera.yaw = building.yaw;
      advance(110, walking);
      advance(24);
      const p = state.player.position;
      const localZ = (p.x - building.position.x) * Math.sin(building.yaw) + (p.z - building.position.z) * Math.cos(building.yaw);
      expect(localZ, building.id).toBeGreaterThan(building.depth / 2 + PLAYER.radius - 0.01);
      expect(localZ, building.id).toBeLessThan(building.depth / 2 + PLAYER.radius + 0.04);
      expect(p.y - building.position.y - 0.18, building.id).toBeGreaterThan(0);
      expect(p.y - building.position.y - 0.18, building.id).toBeLessThan(0.025);
      expect(staticWorld.overlaps({ ...p, y: p.y + PLAYER.height / 2 }, capsule), building.id).toEqual([]);
      expect(state.player.grounded, building.id).toBe(true);
      expect(state.resets, building.id).toBe(resets);
      state.camera.yaw = building.yaw + Math.PI;
      advance(50, walking);
      advance(24);
      // Civic approach returns to its real staircase; all other entrances rest on the base terrace.
      if (building.archetype !== 'civic') {
        expect(state.player.position.y - building.position.y, building.id).toBeGreaterThan(0);
        expect(state.player.position.y - building.position.y, building.id).toBeLessThan(0.025);
        expect(state.player.grounded, building.id).toBe(true);
        expect(staticWorld.overlaps({ ...state.player.position, y: state.player.position.y + PLAYER.height / 2 }, capsule), building.id).toEqual([]);
      }
    }
  } finally { staticWorld.world.free(); }
});

for (const direction of ['outward', 'reverse'] as const) {
  test(`continuous ${direction} district circuit walks every street, stair and both bridges without jumping or teleports`, async () => {
    const route = direction === 'outward' ? [...DISTRICT_ROUTE] : [...DISTRICT_ROUTE].reverse();
    const staticWorld = collisionWorld(course);
    const cameraRig = createCameraRig(state, physics);
    const cameraBall = new RAPIER.Ball(0.27);
    const capsule = new RAPIER.Capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius);
    place({ ...route[0]!, y: route[0]!.y + 0.04 });
    const resets = state.resets;
    let steps = 0;
    let maximumStep = 0;
    let minimumHeight = Infinity;
    let maximumHeight = -Infinity;
    const cameraFailures: string[] = [];
    const reached: { expected: Vec3; actual: Vec3 }[] = [];
    try {
      for (let waypoint = 1; waypoint < route.length; waypoint++) {
        const destination = route[waypoint]!;
        const start = { ...state.player.position };
        const frames = Math.ceil((Math.hypot(destination.x - start.x, destination.z - start.z) / PLAYER.walkSpeed + 4) / FIXED_DT);
        for (let frame = 0; frame < frames; frame++) {
          const p = state.player.position;
          const dx = destination.x - p.x, dz = destination.z - p.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.10) break;
          state.camera.yaw = Math.atan2(-dx, -dz);
          physics.step(state, walking, FIXED_DT);
          const current = state.player.position;
          maximumStep = Math.max(maximumStep, Math.hypot(current.x - p.x, current.y - p.y, current.z - p.z));
          minimumHeight = Math.min(minimumHeight, current.y);
          maximumHeight = Math.max(maximumHeight, current.y);
          if (steps % 12 === 0) {
            cameraRig.update(12 * FIXED_DT, 1.6);
            const hits = staticWorld.overlaps(cameraRig.camera.position, cameraBall);
            if (hits.length) cameraFailures.push(`waypoint${waypoint} frame${frame}: ${hits}`);
          }
          steps++;
        }
        advance(24);
        const context = `waypoint${waypoint} ${JSON.stringify(destination)}, actual ${JSON.stringify(state.player.position)}`;
        expect(Math.hypot(state.player.position.x - destination.x, state.player.position.z - destination.z), context).toBeLessThan(0.14);
        const support = staticWorld.support(destination);
        expect(support, context).not.toBeNull();
        // Rapier's skin is a maximum separation; large trimesh faces converge
        // below .015 m. Prove real separation/shape clearance, not an exact skin.
        expect(state.player.position.y - support!.y, context).toBeGreaterThan(0);
        expect(state.player.position.y - support!.y, context).toBeLessThan(0.025);
        expect(staticWorld.overlaps({ ...state.player.position, y: state.player.position.y + PLAYER.height / 2 }, capsule), context).toEqual([]);
        expect(state.player.grounded, context).toBe(true);
        expect(state.resets, context).toBe(resets);
        reached.push({ expected: { ...destination }, actual: { ...state.player.position } });
      }
      expect(steps).toBeGreaterThan(10_000);
      expect(maximumStep).toBeLessThan(0.23);
      expect(minimumHeight).toBeGreaterThan(-0.025);
      expect(maximumHeight).toBeGreaterThan(5.35);
      expect(maximumHeight).toBeLessThan(5.42);
      expect(cameraFailures.slice(0, 20), `${cameraFailures.length} camera overlaps`).toEqual([]);
      await test.info().attach(`district-route-${direction}`, { contentType: 'application/json', body: Buffer.from(JSON.stringify({
        direction, waypointCount: route.length, reachedCount: reached.length, walkingSteps: steps,
        maximumStepMeters: maximumStep, minimumFeetHeight: minimumHeight, maximumFeetHeight: maximumHeight,
        resetsAfterSetup: state.resets - resets, cameraOverlaps: cameraFailures.length,
        walkingSpeed: PLAYER.walkSpeed, fixedStepSeconds: FIXED_DT, jumps: 0, reached,
      }, null, 2)) });
    } finally { cameraRig.dispose(); staticWorld.world.free(); }
  });
}

test('canal parapets and bridge rails stop walking sideways while both deck entries stay open', () => {
  for (const bridge of DISTRICT.bridges) {
    place({ x: bridge.x, y: 0.12, z: bridge.z });
    state.camera.yaw = -Math.PI / 2;
    const resets = state.resets;
    advance(140, walking);
    expect(state.player.position.x, bridge.id).toBeLessThan(bridge.x + bridge.width / 2 - PLAYER.radius);
    expect(state.player.position.y - bridge.y, bridge.id).toBeGreaterThan(0);
    expect(state.player.position.y - bridge.y, bridge.id).toBeLessThan(0.025);
    expect(state.player.grounded, bridge.id).toBe(true);
    expect(state.resets).toBe(resets);
  }
  place({ x: 110, y: 0.04, z: 10 });
  state.camera.yaw = Math.PI;
  advance(140, walking);
  expect(state.player.position.z).toBeLessThan(11.84 - 0.16 - PLAYER.radius + 0.02);
  expect(state.player.position.y).toBeGreaterThan(0);
  expect(state.player.position.y).toBeLessThan(0.025);
  expect(state.player.grounded).toBe(true);
  place({ x: 110, y: 0.04, z: 28 });
  state.camera.yaw = 0;
  advance(140, walking);
  expect(state.player.position.z).toBeGreaterThan(26.16 + 0.16 + PLAYER.radius - 0.02);
  expect(state.player.position.y).toBeGreaterThan(0);
  expect(state.player.position.y).toBeLessThan(0.025);
  expect(state.player.grounded).toBe(true);
});
