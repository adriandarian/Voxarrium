import { expect, test } from '@playwright/test';
import { createRuralCourse } from '../src/simulation/rural';
import { createPhysics } from '../src/physics/physics';
import type { Physics } from '../src/physics/physics';
import { FIXED_DT, IDLE_INPUT } from '../src/simulation/types';
import type { GameState, InputFrame } from '../src/simulation/types';

const course = createRuralCourse();
const walking = { ...IDLE_INPUT, forward: 1 };
let physics: Physics;
let state: GameState;
function advance(frames: number, input: InputFrame = IDLE_INPUT) {
  for (let i = 0; i < frames; i++) physics.step(state, input, FIXED_DT);
}
function bookmark(name: string) {
  const entry = course.bookmarks[name]!;
  physics.reset(state, entry.position);
  state.camera.yaw = entry.yaw;
  advance(20);
}
function walkToZ(target: number) {
  const direction = Math.sign(target - state.player.position.z);
  state.camera.yaw = direction > 0 ? Math.PI : 0;
  for (let frame = 0; frame < 600 && direction * (target - state.player.position.z) > 0; frame++) {
    physics.step(state, walking, FIXED_DT);
  }
  advance(20);
  expect(Math.abs(state.player.position.z - target)).toBeLessThan(0.25);
}
test.beforeEach(async () => {
  physics = await createPhysics(course);
  state = {
    sceneId: course.id, seed: course.seed, tick: 0, elapsed: 0, paused: false, resets: 0,
    player: { position: { ...course.spawn }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, heading: 0 },
    camera: { mode: 'third-person', yaw: 0, pitch: 0, debugPosition: { x: 0, y: 25, z: 30 } },
  };
});
test.afterEach(() => physics.dispose());

test('rural geometry has deterministic serializable terrain and stable feature IDs', () => {
  expect(JSON.parse(JSON.stringify(course))).toEqual(createRuralCourse());
  expect(course.bounds).toBe(48);
  const allIds = [...course.boxes, ...course.surfaces!].map(feature => feature.id);
  expect(new Set(allIds).size).toBe(allIds.length);
  for (const surface of course.surfaces!) {
    expect(surface.vertices.every(Number.isFinite)).toBe(true);
    expect(surface.indices.every(index => index >= 0 && index < surface.vertices.length / 3)).toBe(true);
  }
});

test('every rural inspection bookmark rests on the actual triangle terrain', () => {
  for (const [name, entry] of Object.entries(course.bookmarks)) {
    bookmark(name);
    expect(state.player.grounded, name).toBe(true);
    expect(state.player.position.y, name).toBeCloseTo(entry.position.y - 0.025, 2);
  }
});

test('main stone stairs climb four meters and descend without jumping', () => {
  bookmark('stairs');
  walkToZ(1.4);
  expect(state.player.position.y).toBeCloseTo(4.015, 2);
  expect(state.player.grounded).toBe(true);
  walkToZ(10.8);
  expect(state.player.position.z).toBeGreaterThan(10.4);
  expect(state.player.position.y).toBeCloseTo(0.015, 2);
});

test('crop stairs connect the cottage terrace to the elevated wheat field', () => {
  bookmark('cropStairs');
  walkToZ(-22);
  expect(state.player.position.z).toBeLessThan(-21);
  expect(state.player.position.y).toBeCloseTo(7.415, 2);
  expect(state.player.grounded).toBe(true);
  walkToZ(-13);
  expect(state.player.position.z).toBeGreaterThan(-14);
  expect(state.player.position.y).toBeCloseTo(4.015, 2);
});

test('bridge connects both irregular riverbanks at walking height', () => {
  bookmark('bridge');
  const resets = state.resets;
  for (let i = 0; i < 460; i++) {
    physics.step(state, walking, FIXED_DT);
    expect(state.player.position.y).toBeGreaterThan(-0.025);
  }
  expect(state.resets).toBe(resets);
  expect(state.player.position.z).toBeGreaterThan(28.5);
  expect(state.player.position.y).toBeCloseTo(0.015, 2);
});

test('cottage facades are solid from all four sides while perimeter remains accessible', () => {
  for (const name of ['cottageFront', 'cottageRear', 'cottageWest', 'cottageEast']) {
    bookmark(name);
    advance(120, walking);
    advance(12);
    const p = state.player.position;
    if (name === 'cottageFront') expect(p.y, name).toBeGreaterThan(4.39);
    else expect(Math.abs(p.y - 4.015), name).toBeLessThan(0.025);
    expect(Math.abs(p.x) > 3.85 || p.z < -10.35 || p.z > -3.65, name).toBe(true);
    expect(state.player.grounded, name).toBe(true);
  }
});

test('cottage entrance steps climb to the raised threshold without jumping and stop at the closed door', () => {
  bookmark('cottageFront');
  const originalResets = state.resets;
  advance(180, walking);
  advance(12);
  expect(state.player.position.y).toBeGreaterThan(4.42);
  expect(state.player.position.y).toBeLessThan(4.49);
  expect(state.player.position.z).toBeLessThan(-3.5);
  expect(state.player.position.z).toBeGreaterThan(-3.65);
  expect(state.player.grounded).toBe(true);
  expect(state.resets).toBe(originalResets);
  state.camera.yaw = Math.PI;
  advance(100, walking);
  expect(state.player.position.z).toBeGreaterThan(-1);
  expect(state.player.position.y).toBeCloseTo(4.015, 2);
});
