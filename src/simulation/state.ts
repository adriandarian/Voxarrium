import type { CourseSpec, GameState } from './types';

export function createState(course: CourseSpec): GameState {
  return {
    sceneId: course.id, seed: course.seed, tick: 0, elapsed: 0,
    paused: true, resets: 0,
    player: { position: { ...course.spawn }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, heading: 0 },
    camera: { mode: 'third-person', yaw: 0, pitch: -0.15, debugPosition: { x: 0, y: 8, z: 16 } },
  };
}
