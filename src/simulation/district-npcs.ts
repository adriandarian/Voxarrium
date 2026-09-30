import { DISTRICT_BUILDINGS } from './district-layout';
import type { NpcDefinition } from './npcs';
import type { Vec3 } from './types';

/** Authored city routines share M3's controller and serializable state. No service calls. */
const nodes: Record<string, Vec3> = {};
const edges: [string, string][] = [];
const add = (id: string, x: number, z: number, y = 4.012) => { nodes[id] = { x, y, z }; return id; };
const chain = (prefix: string, xs: number[], z: number, y = 4.012) => xs.map((x, i) => {
  const id = add(`d.${prefix}.${i}`, x, z, y);
  if (i) edges.push([`d.${prefix}.${i - 1}`, id]);
  return id;
});
const main = chain('main', [52, 64, 75, 89, 100, 112, 129, 145], -10);
const upper = chain('upper', [50, 61, 72, 89, 100, 112, 130, 145], -28);
const quay = chain('south', [50, 62, 74, 86, 96, 108, 120, 129, 144], 29, 0.012);
for (const i of [0, 3, 5, 7]) edges.push([main[i]!, upper[i]!]);
const plazaNorth = add('d.plaza.north', 89, -20);
const plazaSouth = add('d.plaza.south', 89, -3);
edges.push([plazaNorth, main[3]!], [plazaNorth, upper[3]!], [main[3]!, plazaSouth]);

const names = ['Nessa', 'Alden', 'Suri', 'Perrin', 'Dara', 'Leif', 'Maeve', 'Rowan', 'Ada', 'Cedric',
  'Lina', 'Hugo', 'Tessa', 'Rafe', 'Mina', 'Niko', 'Sabine', 'Emil', 'Wren', 'Oda', 'Bastien',
  'Fara', 'Jory', 'Kira', 'Silas', 'Vera', 'Ansel', 'Clio', 'Dorian', 'Edda', 'Finn', 'Greta',
  'Hale', 'Irina', 'Jun', 'Petra'];
const roleText: Record<string, string> = {
  resident: 'The upper lane is quiet, but I always take the market street when I want to see a familiar face.',
  merchant: 'We gather here because the bridge brings travelers straight to the stalls. Leave the middle of the square clear for carts.',
  worker: 'The workshops share this lane. Listen for the joiner near the west end; work slows when the lamps come on.',
  traveler: 'I came over the eastern bridge. The guild bell is a useful landmark when these little lanes turn you around.',
  'civic keeper': 'Two bridges join the quays. The stone steps beside each landing lead back to the market and the upper lane.',
};
const homes = DISTRICT_BUILDINGS.filter(b => b.archetype !== 'civic');
const definitions: NpcDefinition[] = [];
for (let i = 0; i < 36; i++) {
  const b = homes[i % homes.length]!;
  const role = i >= 26 && i < 30 ? 'merchant' : i >= 26 ? (i % 3 === 0 ? 'civic keeper' : i % 2 ? 'traveler' : 'merchant')
    : b.archetype === 'merchant' ? 'merchant' : b.archetype === 'workshop' ? 'worker' : 'resident';
  const lateral = i < 26 ? -b.width * 0.22 : b.width * 0.22;
  const localZ = b.depth / 2 + 0.7;
  const x = b.position.x + Math.cos(b.yaw) * lateral + Math.sin(b.yaw) * localZ;
  const z = b.position.z - Math.sin(b.yaw) * lateral + Math.cos(b.yaw) * localZ;
  const shelter = add(`d.shelter.${i}`, x, z, b.position.y + 0.012);
  const exitX = x + Math.sin(b.yaw) * 0.35;
  const exitZ = z + Math.cos(b.yaw) * 0.35;
  const exit = add(`d.exit.${i}`, exitX, exitZ, b.position.y + 0.012);
  const candidates = b.position.y < 1 ? quay : b.position.z < -30 ? upper : b.yaw === Math.PI / 2 || b.yaw === -Math.PI / 2 ? [plazaNorth] : main;
  // Project onto the street first so no diagonal shortcut clips a neighbor's corner.
  let nearest = candidates[0]!;
  for (const node of candidates) if (Math.abs(nodes[node]!.x - x) < Math.abs(nodes[nearest]!.x - x)) nearest = node;
  const approach = add(`d.approach.${i}`, exitX, nodes[nearest]!.z, b.position.y + 0.012);
  edges.push([shelter, exit], [exit, approach], [approach, nearest]);
  const street = candidates === quay ? quay : candidates === upper ? upper : main;
  const index = Math.max(0, street.indexOf(nearest));
  const next = street[Math.min(street.length - 1, index + 1)]!;
  const previous = street[Math.max(0, index - 1)]!;
  let dayRoute = role === 'traveler' || role === 'civic keeper'
    ? [nearest, next, street[Math.max(0, index - 2)]!, shelter]
    : [shelter, nearest, i % 2 ? previous : next];
  // Four dedicated stall keepers start behind their counters, then use the
  // meeting points at different times. Shelter remains a household eave.
  if (i >= 26 && i < 30) {
    const stallIndex = i - 26, sx = stallIndex % 2 ? 95 : 84;
    const north = stallIndex < 2, sz = north ? -18 : -4;
    const stall = add(`d.stall.${stallIndex}`, sx, sz + (north ? -1.08 : 1.08));
    const exit = add(`d.stall-exit.${stallIndex}`, sx, north ? -20.2 : -2.2);
    edges.push([stall, exit], [exit, north ? plazaNorth : plazaSouth]);
    dayRoute = [stall, north ? plazaNorth : plazaSouth, main[3]!, shelter];
  }
  definitions.push({ id: `district.local.${i.toString().padStart(2, '0')}`, name: `${names[i]} · ${role}`,
    dialogue: roleText[role]!,
    rainDialogue: role === 'merchant' ? 'I have covered the goods and stepped beneath the awning. The square will fill again after the shower.'
      : 'I will wait under these eaves. The canal sounds louder when rain reaches the roofs.',
    eveningDialogue: role === 'civic keeper' ? 'I check the bridge lamps at dusk. You can follow their glow back to the market.'
      : 'Work is finished for today. I will take a short turn, then rest beneath my doorway lamp.',
    dayRoute, duskRoute: [nearest, shelter], shelterNode: shelter,
    walkSpeed: 0.67 + (i % 7) * 0.045, idleSeconds: 4.3 + (i % 9) * 1.4,
    initialWait: 0.6 + (i * 1.73) % 13,
    appearance: { height: 1.56 + (i % 8) * 0.035,
      coat: [0x657246, 0x496c70, 0x9b6849, 0xa69770, 0x775653, 0x526455][i % 6]!,
      trousers: [0x514d40, 0x625444, 0x454d52][i % 3]!, skin: [0xb78965, 0xd3a67e, 0x91664c, 0xe0b993][i % 4]!,
      hair: [0x3e3027, 0x776d5a, 0x594337][i % 3]!, hat: i % 3 === 0, apron: role === 'merchant' || role === 'worker' },
  });
}
export const DISTRICT_NPC_NODES: Readonly<Record<string, Vec3>> = nodes;
export const DISTRICT_NPC_EDGES: readonly (readonly [string, string])[] = edges;
export const DISTRICT_NPC_DEFINITIONS: readonly NpcDefinition[] = definitions;
