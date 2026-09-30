import type { EnvironmentState } from './environment';
import type { NpcState } from './npcs';
import type { Interaction } from './interaction';
/** Serializable contracts. Coordinates are meters; player.position is at the feet. */
export interface Vec3 { x: number; y: number; z: number }
export type CameraMode = 'third-person' | 'first-person' | 'free' | 'eagle-eye';
export interface PlayerState {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  heading: number;
}
export interface GameState {
  sceneId: string;
  seed: number;
  tick: number;
  elapsed: number;
  paused: boolean;
  resets: number;
  player: PlayerState;
  camera: { mode: CameraMode; yaw: number; pitch: number; debugPosition: Vec3 };
  environment: EnvironmentState | null;
  population: NpcState[];
  interaction: Interaction | null;
}
export interface InputFrame {
  forward: number;
  right: number;
  run: boolean;
  jump: boolean;
  ascend: number;
}
export const IDLE_INPUT: InputFrame = { forward: 0, right: 0, run: false, jump: false, ascend: 0 };
export interface BoxSpec {
  id: string;
  position: Vec3;
  size: Vec3;
  color: number;
  rotationX?: number;
  rotationY?: number;
  collides: boolean;
  /** Collision-only proxy (e.g. imported GLB) when false. */
  visible?: boolean;
}
export interface Bookmark { position: Vec3; yaw: number; pitch: number }
export interface CourseSpec {
  id: string;
  seed: number;
  spawn: Vec3;
  boxes: BoxSpec[];
  labels: { text: string; position: Vec3 }[];
  bookmarks: Record<string, Bookmark>;
  /** Authored static triangle surfaces, shared by render and collision. */
  surfaces?: { id: string; vertices: number[]; indices: number[]; color: number }[];
  bounds?: number;
}
export const PLAYER = {
  height: 1.75, radius: 0.30, eyeHeight: 1.62,
  walkSpeed: 2.6, runSpeed: 5.4, jumpSpeed: 5.6, gravity: 18,
} as const;
export const FIXED_DT = 1 / 60;
