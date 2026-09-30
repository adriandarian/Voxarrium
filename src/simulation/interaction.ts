import type { Vec3 } from './types';
import type { NpcState } from './npcs';
import { nearestNpc, npcDialogue } from './npcs';
import type { EnvironmentState } from './environment';

export interface Interaction { id: string; name: string; text: string; position?: Vec3 }
export interface InteractionTarget extends Interaction { position: Vec3; kind: 'npc' | 'landmark' }
const LANDMARKS = [
  { id: 'landmark.herbs', name: 'The herb garden', position: { x: 9, y: 4, z: 2.8 },
    text: 'Sage and thyme grow nearest the path; tender greens stay tucked behind the fence. Leave the beds as you found them.' },
  { id: 'landmark.bridge', name: 'The river crossing', position: { x: -2, y: 0, z: 10.5 },
    text: 'The timber bridge carries the old garden path across the river. Listen for the change from earth to wood beneath your feet.' },
] as const;

export function interactionTarget(population: NpcState[], position: Vec3, environment: EnvironmentState): InteractionTarget | null {
  const npc = nearestNpc(population, position, 2.4);
  if (npc) return { id: npc.id, ...npcDialogue(npc.id, environment), position: npc.position, kind: 'npc' };
  const landmark = LANDMARKS.find(item => Math.hypot(item.position.x - position.x, item.position.y - position.y, item.position.z - position.z) < 2.1);
  return landmark ? { ...landmark, position: { ...landmark.position }, kind: 'landmark' } : null;
}
