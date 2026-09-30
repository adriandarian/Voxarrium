import { RURAL } from './rural-layout';
import type { Vec3 } from './types';

export interface NpcEnvironment {
  weather: 'clear' | 'cloudy' | 'rain';
  timeOfDay: 'day' | 'dusk' | 'night';
}

export type NpcMode = 'idle' | 'walking' | 'shelter-seeking' | 'sheltered' | 'resting' | 'talking';

/** Feet positions in meters. All routine/progress fields survive JSON save/load. */
export interface NpcState {
  id: string;
  position: Vec3;
  heading: number;
  mode: NpcMode;
  nodeId: string;
  nextNodeId: string | null;
  routeIndex: number;
  wait: number;
  schedule: NpcEnvironment['timeOfDay'];
  distanceTravelled: number;
  /** Actual distance moved per second in the last fixed step; drives walking animation. */
  speed: number;
}

interface NpcDefinition {
  id: string;
  name: string;
  dialogue: string;
  rainDialogue: string;
  eveningDialogue: string;
  dayRoute: readonly string[];
  duskRoute: readonly string[];
  shelterNode: string;
  walkSpeed: number;
  idleSeconds: number;
  initialWait: number;
  appearance: {
    height: number;
    coat: number;
    trousers: number;
    skin: number;
    hair: number;
    hat: boolean;
    apron: boolean;
  };
}

const feet = (x: number, z: number): Vec3 => ({ x, y: RURAL.cottage.y + 0.012, z });

/**
 * Authored walking graph over the fixed M2 terrace. No shortcut crosses a wall,
 * garden fence or terrace edge. Front/rear shelters use the existing roof's
 * 3.67 m half-depth; their positions clear the collision wall and door steps.
 * Unseen routines/names are local design assumptions, not reference-image facts.
 */
export const NPC_ROUTE_NODES: Readonly<Record<string, Vec3>> = {
  'front-west': feet(-4.7, -1.9),
  'front-center': feet(-1.9, -1.6),
  'front-east': feet(2.4, -1.1),
  'east-apron': feet(4.8, -1.6),
  'garden-approach': feet(5.4, 2.95),
  'garden-path': feet(6.8, 2.95),
  'garden-gate': feet(9.5, 2.95),
  'garden-edge': feet(12.8, 3.0),
  'shed-path': feet(-8, 1.35),
  'shed-apron': feet(-10.9, 1.45),
  'west-lane': feet(-14.4, 2.4),
  'west-work': feet(-17, -5),
  'west-crop-approach': feet(-14, -13.1),
  'rear-west': feet(-5.1, -12),
  'rear-center': feet(-1.8, -12),
  'rear-east': feet(4.9, -12),
  'east-side': feet(4.9, -7),
  'porch-west': feet(-2.65, -3.47),
  'porch-west-inner': feet(-1.45, -3.47),
  'porch-east-inner': feet(1.45, -3.47),
  'porch-east': feet(2.65, -3.47),
  'rear-eave-west': feet(-2.65, -10.48),
  'rear-eave-center': feet(-1.35, -10.48),
};

export const NPC_ROUTE_EDGES: readonly (readonly [string, string])[] = [
  ['front-west', 'front-center'], ['front-center', 'front-east'], ['front-east', 'east-apron'],
  ['east-apron', 'garden-approach'], ['garden-approach', 'garden-path'],
  ['garden-path', 'garden-gate'], ['garden-gate', 'garden-edge'],
  ['front-west', 'shed-path'], ['shed-path', 'shed-apron'], ['shed-apron', 'west-lane'],
  ['west-lane', 'west-work'], ['west-work', 'west-crop-approach'],
  ['west-crop-approach', 'rear-west'], ['rear-west', 'rear-center'], ['rear-center', 'rear-east'],
  ['rear-east', 'east-side'], ['east-side', 'east-apron'],
  ['front-west', 'porch-west'], ['front-center', 'porch-west-inner'],
  ['front-east', 'porch-east-inner'], ['east-apron', 'porch-east'],
  ['rear-west', 'rear-eave-west'], ['rear-center', 'rear-eave-center'],
];

export const NPC_DEFINITIONS: readonly NpcDefinition[] = [
  {
    id: 'local.mara', name: 'Mara · gardener',
    dialogue: 'Welcome to our garden. The gap in the fence is just ahead; please keep to the worn path between the beds.',
    rainDialogue: 'A little rain does the beans good. I will wait under the cottage eaves until it passes.',
    eveningDialogue: 'The garden can rest now. I like watching the last light catch the river.',
    dayRoute: ['garden-gate', 'garden-edge', 'garden-path', 'front-east'],
    duskRoute: ['garden-path', 'front-east'], shelterNode: 'porch-east',
    walkSpeed: 0.78, idleSeconds: 7, initialWait: 3,
    appearance: { height: 1.64, coat: RURAL.palette.teal, trousers: 0x625743, skin: 0xb98c65, hair: 0x423127, hat: true, apron: true },
  },
  {
    id: 'local.tomas', name: 'Tomas · caretaker',
    dialogue: 'Glad you found us. The stone stairs lead down to the bridge, and the path west of the cottage reaches the wheat.',
    rainDialogue: 'The old roof still keeps a dry edge. Come share it while the rain settles.',
    eveningDialogue: 'I am checking the shed before we turn in. Take your time on the stairs after dark.',
    dayRoute: ['shed-path', 'shed-apron', 'front-west', 'front-center'],
    duskRoute: ['shed-apron', 'front-west'], shelterNode: 'porch-west',
    walkSpeed: 0.82, idleSeconds: 6, initialWait: 6,
    appearance: { height: 1.75, coat: 0x8a653e, trousers: 0x4c493a, skin: 0xd0a27b, hair: 0x635849, hat: true, apron: false },
  },
  {
    id: 'local.iona', name: 'Iona · herb keeper',
    dialogue: 'Listen beside the bridge for a moment. You can hear the water long before you see its bright bend.',
    rainDialogue: 'The air smells of wet leaves. The herbs can wait; these eaves are a fine place to listen.',
    eveningDialogue: 'The shadows are getting long. I will put the herbs away and stay close to the cottage.',
    dayRoute: ['front-center', 'front-east', 'garden-path'],
    duskRoute: ['front-center', 'front-east'], shelterNode: 'porch-east-inner',
    walkSpeed: 0.73, idleSeconds: 9, initialWait: 1,
    appearance: { height: 1.58, coat: 0x9a6147, trousers: 0x59574a, skin: 0x996e50, hair: 0x302b27, hat: false, apron: true },
  },
  {
    id: 'local.bram', name: 'Bram · groundskeeper',
    dialogue: 'This western path joins the crop stairs. We leave the terrace edges wild for the roots and the birds.',
    rainDialogue: 'No sense tending a path in a shower. I will take the long way around to the dry rear eave.',
    eveningDialogue: 'A quiet evening is the best reward for a day outside. Tomorrow I will finish the west path.',
    dayRoute: ['west-work', 'west-lane', 'shed-apron', 'west-crop-approach'],
    duskRoute: ['west-crop-approach', 'rear-west'], shelterNode: 'rear-eave-west',
    walkSpeed: 0.87, idleSeconds: 8, initialWait: 4,
    appearance: { height: 1.78, coat: 0x626b40, trousers: 0x574b3d, skin: 0xb9805c, hair: 0x40342b, hat: true, apron: false },
  },
  {
    id: 'local.elin', name: 'Elin · neighbor',
    dialogue: 'There is a path around the whole cottage. The rear windows have a lovely view of the upper field.',
    rainDialogue: 'The rear roof edge is dry enough for two. I always keep an eye on the clouds over the field.',
    eveningDialogue: 'The field is almost gold at dusk. I am taking one last turn before resting here.',
    dayRoute: ['rear-east', 'rear-center', 'east-side'],
    duskRoute: ['rear-center', 'rear-east'], shelterNode: 'rear-eave-center',
    walkSpeed: 0.76, idleSeconds: 10, initialWait: 2,
    appearance: { height: 1.66, coat: 0xb5a075, trousers: 0x655a4c, skin: 0xdcaf86, hair: 0x7d7464, hat: false, apron: false },
  },
  {
    id: 'local.orrin', name: 'Orrin · woodworker',
    dialogue: 'The bridge boards are sound. If you head over the water, turn back once to see the cottage above the bank.',
    rainDialogue: 'Wet timber can wait. I will shelter here and check the tools after the shower.',
    eveningDialogue: 'Tools away, work finished. All that is left is a slow walk home along the cottage path.',
    dayRoute: ['front-west', 'shed-path', 'west-lane'],
    duskRoute: ['shed-path', 'front-west'], shelterNode: 'porch-west-inner',
    walkSpeed: 0.8, idleSeconds: 5, initialWait: 0.5,
    appearance: { height: 1.71, coat: 0x547773, trousers: 0x534437, skin: 0x9b7257, hair: 0x322b26, hat: false, apron: true },
  },
];

const definitions = new Map(NPC_DEFINITIONS.map(definition => [definition.id, definition]));
const neighbors = new Map<string, string[]>();
for (const [a, b] of NPC_ROUTE_EDGES) {
  neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
  neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Small fixed graph: shortest authored route, with stable insertion-order ties. */
function nextToward(from: string, goal: string): string | null {
  if (from === goal) return null;
  const cost = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const open = new Set<string>([from]);
  while (open.size) {
    let current = [...open][0]!;
    for (const candidate of open) if (cost.get(candidate)! < cost.get(current)!) current = candidate;
    open.delete(current);
    if (current === goal) break;
    for (const neighbor of neighbors.get(current) ?? []) {
      const proposal = cost.get(current)! + distance(NPC_ROUTE_NODES[current]!, NPC_ROUTE_NODES[neighbor]!);
      if (proposal >= (cost.get(neighbor) ?? Infinity)) continue;
      cost.set(neighbor, proposal);
      previous.set(neighbor, current);
      open.add(neighbor);
    }
  }
  if (!previous.has(goal)) return null;
  let next = goal;
  while (previous.get(next) !== from) next = previous.get(next)!;
  return next;
}

function face(npc: NpcState, x: number, z: number, dt: number) {
  if (Math.hypot(x, z) < 0.001) return;
  const target = Math.atan2(-x, -z);
  const difference = Math.atan2(Math.sin(target - npc.heading), Math.cos(target - npc.heading));
  npc.heading += Math.max(-dt * 3.8, Math.min(dt * 3.8, difference));
}

export function createPopulation(): NpcState[] {
  return NPC_DEFINITIONS.map(definition => ({
    id: definition.id, position: { ...NPC_ROUTE_NODES[definition.dayRoute[0]!]! },
    heading: 0, mode: 'idle', nodeId: definition.dayRoute[0]!, nextNodeId: null,
    routeIndex: 0, wait: definition.initialWait, schedule: 'day', distanceTravelled: 0, speed: 0,
  }));
}

/**
 * Nonblocking locals have no dynamic collider. Their static authored navigation
 * is tested against the actual M2 Rapier collision, not a different render map.
 * Player interaction freezes the current segment and resumes from that point.
 */
export function stepPopulation(
  population: NpcState[], dt: number, environment: NpcEnvironment, player: Vec3,
  interactingId: string | null = null,
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.1);
  for (const npc of population) {
    const definition = definitions.get(npc.id);
    if (!definition) continue;
    npc.speed = 0;
    if (npc.schedule !== environment.timeOfDay) {
      npc.schedule = environment.timeOfDay;
      npc.routeIndex = 0;
      npc.wait = 0;
    }
    if (npc.id === interactingId) {
      npc.mode = 'talking';
      face(npc, player.x - npc.position.x, player.z - npc.position.z, dt);
      continue;
    }
    const shelter = environment.weather === 'rain' || environment.timeOfDay === 'night';
    const route = environment.timeOfDay === 'dusk' ? definition.duskRoute : definition.dayRoute;
    let remaining = dt;
    let moved = 0;
    // At most one short authored edge can complete in 0.1 s, plus idle transitions.
    for (let transition = 0; transition < 4 && remaining > 0.000001; transition++) {
      if (!npc.nextNodeId) {
        let goal: string;
        if (shelter) {
          npc.wait = 0;
          goal = definition.shelterNode;
          if (npc.nodeId === goal) {
            npc.mode = environment.weather === 'rain' ? 'sheltered' : 'resting';
            face(npc, 0, Math.sign(npc.position.z - RURAL.cottage.z), dt);
            break;
          }
        } else {
          npc.routeIndex %= route.length;
          if (npc.wait > 0) {
            const used = Math.min(npc.wait, remaining);
            npc.wait -= used;
            remaining -= used;
            npc.mode = 'idle';
            if (remaining <= 0.000001) break;
          }
          goal = route[npc.routeIndex]!;
          if (npc.nodeId === goal) {
            npc.routeIndex = (npc.routeIndex + 1) % route.length;
            goal = route[npc.routeIndex]!;
          }
        }
        npc.nextNodeId = nextToward(npc.nodeId, goal);
        if (!npc.nextNodeId) { npc.mode = 'idle'; break; }
      }
      const target = NPC_ROUTE_NODES[npc.nextNodeId]!;
      const length = distance(npc.position, target);
      const speed = definition.walkSpeed * (shelter ? 1.18 : 1);
      const travel = Math.min(length, speed * remaining);
      const dx = target.x - npc.position.x, dz = target.z - npc.position.z;
      face(npc, dx, dz, remaining);
      if (length > 0.000001) {
        const fraction = travel / length;
        npc.position.x += dx * fraction;
        npc.position.y += (target.y - npc.position.y) * fraction;
        npc.position.z += dz * fraction;
      }
      moved += travel;
      remaining -= travel / speed;
      npc.mode = shelter ? 'shelter-seeking' : 'walking';
      if (travel < length - 0.000001) break;
      npc.position = { ...target };
      npc.nodeId = npc.nextNodeId;
      npc.nextNodeId = null;
      if (!shelter && npc.nodeId === route[npc.routeIndex]) npc.wait = definition.idleSeconds;
    }
    npc.distanceTravelled += moved;
    npc.speed = moved / dt;
  }
}

export function nearestNpc(population: NpcState[], player: Vec3, maxDistance = 2.4): NpcState | null {
  if (!Number.isFinite(maxDistance) || maxDistance < 0) return null;
  let nearest: NpcState | null = null;
  let closest = maxDistance;
  for (const npc of population) {
    const separation = distance(npc.position, player);
    if (separation > closest || !Number.isFinite(separation)) continue;
    if (separation === closest && nearest && nearest.id < npc.id) continue;
    nearest = npc;
    closest = separation;
  }
  return nearest;
}

export function npcDialogue(id: string, environment: NpcEnvironment): { name: string; text: string } {
  const definition = definitions.get(id);
  if (!definition) return { name: 'Neighbor', text: 'Welcome to the cottage paths.' };
  return {
    name: definition.name,
    text: environment.weather === 'rain' ? definition.rainDialogue
      : environment.timeOfDay !== 'day' ? definition.eveningDialogue : definition.dialogue,
  };
}
