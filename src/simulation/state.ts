import type { CourseSpec, GameState } from './types';
import { createEnvironment } from './environment';
import { createPopulation } from './npcs';

export function createState(course: CourseSpec): GameState {
  return {
    sceneId: course.id, seed: course.seed, tick: 0, elapsed: 0,
    paused: true, resets: 0,
    player: { position: { ...course.spawn }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, heading: 0 },
    camera: { mode: 'third-person', yaw: 0, pitch: -0.15, debugPosition: { x: 0, y: 8, z: 16 } },
    environment: course.id !== 'm1-human-scale-64m' ? createEnvironment() : null,
    population: course.id === 'm4-market-district' || course.id === 'm5-streaming-proof' || course.id === 'm6-city-blueprint' ? createPopulation(true) : course.id === 'm2-rural-96m' ? createPopulation() : [], interaction: null,
  };
}
