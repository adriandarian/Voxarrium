import { expect, test } from '@playwright/test';
import { createState } from '../src/simulation/state';
import { createRuralCourse } from '../src/simulation/rural';
import { createCourse } from '../src/simulation/course';
import { interactionTarget } from '../src/simulation/interaction';
import { footstepSurface } from '../src/audio/audio';

test('living state remains serializable and M1 stays an empty population', () => {
  const state = createState(createRuralCourse());
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  expect(state.population).toHaveLength(6);
  expect(state.environment?.timeOfDay).toBe('day');
  const m1 = createState(createCourse());
  expect(m1.environment).toBeNull(); expect(m1.population).toEqual([]);
});

test('interaction has player-scale reach and does not cross terrace levels', () => {
  const state = createState(createRuralCourse());
  const local = state.population[0]!;
  const close = { ...local.position, z: local.position.z + 1.3 };
  const target = interactionTarget(state.population, close, state.environment!);
  expect(target?.kind).toBe('npc'); expect(target?.text.length).toBeGreaterThan(30);
  expect(interactionTarget(state.population, { ...close, y: close.y - 4 }, state.environment!)).toBeNull();
  expect(interactionTarget(state.population, { x: 40, y: 4, z: -40 }, state.environment!)).toBeNull();
  expect(interactionTarget([], { x: 9, y: 4, z: 2.8 }, state.environment!)?.id).toBe('landmark.herbs');
});

test('surface footsteps distinguish the bridge, both stairs, path and meadow', () => {
  expect(footstepSurface({ x: -2, y: 0, z: 18 })).toBe('wood');
  expect(footstepSurface({ x: -7, y: 2, z: 6 })).toBe('stone');
  expect(footstepSurface({ x: -14, y: 6, z: -18 })).toBe('stone');
  expect(footstepSurface({ x: 1, y: 4, z: 1 })).toBe('earth');
  expect(footstepSurface({ x: -25, y: 4, z: -20 })).toBe('grass');
});
