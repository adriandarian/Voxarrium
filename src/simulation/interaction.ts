import type { Vec3 } from './types';
import type { NpcState, NpcNavigation } from './npcs';
import { nearestNpc, npcDialogue } from './npcs';
import type { EnvironmentState } from './environment';
import { DISTRICT_ENTRANCES } from './district';
import { DISTRICT_BUILDINGS } from './district-layout';

export interface Interaction { id: string; name: string; text: string; position?: Vec3 }
export interface InteractionTarget extends Interaction { position: Vec3; kind: 'npc' | 'landmark' }
const LANDMARKS = [
  { id: 'landmark.herbs', name: 'The herb garden', position: { x: 9, y: 4, z: 2.8 },
    text: 'Sage and thyme grow nearest the path; tender greens stay tucked behind the fence. Leave the beds as you found them.' },
  { id: 'landmark.bridge', name: 'The river crossing', position: { x: -2, y: 0, z: 10.5 },
    text: 'The timber bridge carries the old garden path across the river. Listen for the change from earth to wood beneath your feet.' },
] as const;
const DISTRICT_LANDMARKS = DISTRICT_ENTRANCES.map((entrance, index) => ({
  id: entrance.id,
  name: DISTRICT_BUILDINGS[index]!.id.slice('district.'.length).replaceAll('-', ' '),
  position: entrance.position,
  text: DISTRICT_BUILDINGS[index]!.archetype === 'civic'
    ? 'The Bell Guild keeps the river measures and the market weights. Its doors are closed today; the bell above marks the hours for both quays.'
    : DISTRICT_BUILDINGS[index]!.archetype === 'workshop'
      ? 'Tools and finished work rest behind this door. The workshop is closed to visitors; its entrance joins the lane where neighbors gather.'
      : DISTRICT_BUILDINGS[index]!.archetype === 'merchant'
        ? 'The household trades at the river market. Their door is closed today, but the covered stalls in the square welcome visitors.'
        : 'A lived-in doorway on the river lanes. The door is closed today; window boxes and the sheltered step are tended by the household.',
}));

export function interactionTarget(population: NpcState[], position: Vec3, environment: EnvironmentState,navigation?:NpcNavigation,entrances:readonly {id:string;name:string;text:string;position:Vec3}[]=[]): InteractionTarget | null {
  const npc = nearestNpc(population, position, 2.4);
  if (npc) return { id: npc.id, ...npcDialogue(npc.id, environment,navigation), position: npc.position, kind: 'npc' };
  const landmark = [...LANDMARKS, ...DISTRICT_LANDMARKS,...entrances].find(item => Math.hypot(item.position.x - position.x, item.position.y - position.y, item.position.z - position.z) < 2.1);
  return landmark ? { ...landmark, position: { ...landmark.position }, kind: 'landmark' } : null;
}
