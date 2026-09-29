import { expect, test } from '@playwright/test';
import { createCourse } from '../src/simulation/course';
import { createPhysics } from '../src/physics/physics';
import type { Physics } from '../src/physics/physics';
import { createCameraRig } from '../src/cameras/cameras';
import { FIXED_DT, IDLE_INPUT, PLAYER } from '../src/simulation/types';
import type { GameState, InputFrame, Vec3 } from '../src/simulation/types';

const course = createCourse();
function initialState(): GameState {
  return {
    sceneId: course.id, seed: course.seed, tick: 0, elapsed: 0, paused: false, resets: 0,
    player: { position: { ...course.spawn }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, heading: 0 },
    camera: { mode: 'third-person', yaw: 0, pitch: -0.16, debugPosition: { x: 0, y: 8, z: 15 } },
  };
}
const walk = { ...IDLE_INPUT, forward: 1 };
function advance(physics: Physics, state: GameState, frames: number, input: InputFrame = IDLE_INPUT) {
  for (let index = 0; index < frames; index++) physics.step(state, input, FIXED_DT);
}
function place(physics: Physics, state: GameState, position: Vec3) {
  physics.reset(state, position);
  advance(physics, state, 12);
}

let physics: Physics;
let state: GameState;
test.beforeEach(async () => { physics = await createPhysics(course); state = initialState(); });
test.afterEach(() => { physics.dispose(); });

test('authored meter course is deterministic and contains all traversal features', () => {
  expect(createCourse(18)).toEqual(createCourse(18));
  expect(new Set(course.boxes.map(box => box.id)).size).toBe(course.boxes.length);
  expect(course.boxes.find(box => box.id === 'ground.main')?.size.x).toBe(64);
  expect(course.boxes.filter(box => box.id.startsWith('stairs.step-'))).toHaveLength(8);
  expect(Object.keys(course.bookmarks)).toEqual(expect.arrayContaining(['slope', 'steepSlope', 'stairs', 'doorway', 'alley', 'lowCeiling', 'bridge', 'wall', 'terrace', 'drop']));
});

test('capsule settles, accelerates, runs and decelerates at human scale', () => {
  place(physics, state, { x: -24, y: 0.03, z: 24 });
  expect(state.player.grounded).toBe(true);
  physics.step(state, walk, FIXED_DT);
  expect(Math.abs(state.player.velocity.z)).toBeLessThan(PLAYER.walkSpeed);
  advance(physics, state, 120, walk);
  expect(state.player.position.z).toBeLessThan(19.1);
  expect(state.player.position.z).toBeGreaterThan(18.5);
  advance(physics, state, 60, { ...walk, run: true });
  expect(state.player.velocity.z).toBeCloseTo(-PLAYER.runSpeed, 5);
  advance(physics, state, 30);
  expect(state.player.velocity.z).toBeCloseTo(0, 8);
  expect(state.player.position.y).toBeCloseTo(0.015, 2);
});

test('real capsule traverses 14 degree slope and stays on its 2 m landing', () => {
  place(physics, state, course.bookmarks.slope.position);
  advance(physics, state, 290, walk);
  expect(state.player.position.z).toBeLessThan(-11);
  expect(state.player.position.z).toBeGreaterThan(-14);
  expect(state.player.position.y).toBeCloseTo(2.015, 1);
  expect(state.player.grounded).toBe(true);
});

test('53 degree slope cannot be climbed with the 45 degree controller limit', () => {
  place(physics, state, course.bookmarks.steepSlope.position);
  advance(physics, state, 180, walk);
  expect(state.player.position.z).toBeGreaterThan(-3.6);
  expect(state.player.position.y).toBeLessThan(0.6);
  // Starting above the face proves gravity slides down the steep surface too.
  place(physics, state, { x: 8, y: 3, z: -4.5 });
  advance(physics, state, 180);
  expect(state.player.position.y).toBeLessThan(0.15);
  expect(state.player.position.z).toBeGreaterThan(-3.3);
});

test('actual 17 cm risers and 30 cm treads lead to a 1.36 m terrace', () => {
  place(physics, state, course.bookmarks.stairs.position);
  advance(physics, state, 190, walk);
  expect(state.player.position.z).toBeLessThan(-6);
  expect(state.player.position.y).toBeCloseTo(1.375, 1);
  expect(state.player.grounded).toBe(true);
  state.camera.yaw = Math.PI;
  advance(physics, state, 190, walk);
  expect(state.player.position.z).toBeGreaterThan(-3);
  expect(state.player.position.y).toBeCloseTo(0.015, 1);
});

test('1.10 m doorway and 2.10 m alley allow passage while solid walls block', () => {
  place(physics, state, course.bookmarks.doorway.position);
  advance(physics, state, 160, walk);
  expect(state.player.position.z).toBeLessThan(5);
  place(physics, state, course.bookmarks.alley.position);
  advance(physics, state, 310, walk);
  expect(state.player.position.z).toBeLessThan(2);
  place(physics, state, course.bookmarks.wall.position);
  advance(physics, state, 180, { ...walk, run: true });
  expect(state.player.position.z).toBeGreaterThan(-3.43);
  expect(state.player.position.z).toBeLessThan(-3.35);
});

test('low opening blocks 1.75 m avatar; valid headroom clips jump under its ceiling', () => {
  place(physics, state, course.bookmarks.lowCeiling.position);
  advance(physics, state, 180, walk);
  expect(state.player.position.z).toBeGreaterThan(9.1);
  place(physics, state, course.bookmarks.headroom.position);
  advance(physics, state, 120, walk);
  expect(state.player.position.z).toBeLessThan(2);
  place(physics, state, { x: -4.5, y: 0.03, z: 3 });
  physics.step(state, { ...IDLE_INPUT, jump: true }, FIXED_DT);
  let highest = state.player.position.y;
  for (let index = 0; index < 75; index++) {
    physics.step(state, IDLE_INPUT, FIXED_DT);
    highest = Math.max(highest, state.player.position.y);
  }
  expect(highest).toBeGreaterThan(0.15);
  expect(highest + PLAYER.height).toBeLessThan(2.05);
  expect(state.player.grounded).toBe(true);
});

test('jump rises and lands; bridge spans water gap without falling', () => {
  place(physics, state, { x: -24, y: 0.03, z: 24 });
  physics.step(state, { ...IDLE_INPUT, jump: true }, FIXED_DT);
  let highest = state.player.position.y;
  for (let index = 0; index < 90; index++) {
    physics.step(state, IDLE_INPUT, FIXED_DT);
    highest = Math.max(highest, state.player.position.y);
  }
  expect(highest).toBeGreaterThan(0.75);
  expect(highest).toBeLessThan(1.05);
  expect(state.player.grounded).toBe(true);
  place(physics, state, course.bookmarks.bridge.position);
  for (let index = 0; index < 310; index++) {
    physics.step(state, walk, FIXED_DT);
    expect(state.player.position.y).toBeGreaterThan(-0.02);
  }
  expect(state.player.position.z).toBeLessThan(-29);
});

test('water gap fall recovers to spawn and clears velocity', () => {
  place(physics, state, course.bookmarks.drop.position);
  const resets = state.resets;
  let fellBelowWater = false;
  for (let index = 0; index < 240 && state.resets === resets; index++) {
    physics.step(state, walk, FIXED_DT);
    if (state.player.position.y < -2) fellBelowWater = true;
  }
  expect(fellBelowWater).toBe(true);
  expect(state.resets).toBe(resets + 1);
  expect(state.player.position).toEqual(course.spawn);
  expect(state.player.velocity).toEqual({ x: 0, y: 0, z: 0 });
});

test('camera sphere prevents wall clipping and modes share one untouched player', () => {
  place(physics, state, course.bookmarks.obstruction.position);
  state.camera.yaw = Math.PI;
  state.camera.pitch = -0.08;
  const original = JSON.stringify(state.player);
  const rig = createCameraRig(state, physics);
  rig.update(0, 16 / 10);
  expect(rig.camera.position.z).toBeGreaterThan(-3.46);
  expect(rig.camera.position.z).toBeLessThan(-2.9);
  rig.setMode('first-person');
  rig.update(0, 16 / 10);
  expect(rig.camera.position.y).toBeCloseTo(state.player.position.y + PLAYER.eyeHeight);
  rig.setMode('free');
  rig.moveFree(walk, FIXED_DT);
  rig.update(0, 16 / 10);
  rig.setMode('eagle-eye');
  rig.update(0, 16 / 10);
  const eagle = rig.camera.position.clone();
  rig.update(0, 16 / 10);
  expect(rig.camera.position.toArray()).toEqual(eagle.toArray());
  expect(JSON.stringify(state.player)).toBe(original);
  rig.dispose();
});
