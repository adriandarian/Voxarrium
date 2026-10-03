import type { CityBlueprint } from './city-contracts';
import type { DistrictDressing, FacadeProfile } from './district-art';
import type { NpcDefinition } from './npcs';
import type { UrbanDistrict, UrbanRecipe } from './urban-contracts';
import { urbanBuilding, urbanFloorAt } from './urban-grammar';
import type { Vec3 } from './types';

const p = (x: number, z: number, y = 4): Vec3 => ({ x, y, z });
type Parcel = readonly [id: string, x: number, z: number, width: number, depth: number,
  yaw: number, recipe: UrbanRecipe, y?: number];
const east = Math.PI / 2, west = -Math.PI / 2;

/** Named working parcels follow the accepted bend; these are authored, not filled by a grid search. */
const parcels: readonly Parcel[] = [
  ['ferry-keeper', 254, -94, 6.3, 7.8, east, 'canal-house'],
  ['reed-baskets', 254.4, -105, 6.9, 8.2, east, 'workshop-house'],
  ['line-menders', 253.8, -117, 7.2, 8.0, east, 'workshop-house'],
  ['west-bank-home', 253.4, -130, 6.0, 7.6, east, 'canal-house'],
  ['small-boat-store', 252, -143, 8.4, 7.5, east, 'storehouse'],
  ['willow-house', 237.5, -101, 6.5, 7.4, west, 'canal-house'],
  ['coopers-home', 237.4, -117, 7.4, 8.1, east, 'workshop-house'],
  ['west-wash-house', 237.8, -133, 6.3, 8.2, east, 'canal-house'],
  ['river-repair-shed', 237.4, -149, 7.0, 8.5, east, 'storehouse'],

  ['water-guild', 286, -145, 13.2, 10, west, 'water-guild', 8],
  ['guild-record-wing', 289, -156, 5.6, 8.2, west, 'canal-house', 8],
  ['quay-bell-house', 289.6, -179, 6.3, 7.4, west, 'canal-house', 8],
  ['sail-repair', 290.4, -190, 7.1, 7.2, west, 'workshop-house', 8],
  ['upper-net-house', 290.6, -203, 7.0, 6.8, west, 'canal-house', 8],
  ['guild-cask-shed', 264, -191, 8.1, 9.0, east, 'storehouse', 8],
  ['quay-porter-home', 263, -204, 6.8, 7.0, east, 'canal-house', 8],

  ['east-bank-net-home', 302, -99, 6.3, 7.4, east, 'canal-house'],
  ['east-bank-repair', 302, -111, 6.9, 7.0, east, 'workshop-house'],
  ['east-bank-resident', 302, -123, 7.0, 7.8, east, 'canal-house'],
  ['east-bank-cloth-home', 302, -138, 6.6, 7.6, east, 'workshop-house'],
  ['quay-step-house', 302, -153, 6.2, 7.3, east, 'canal-house'],
  ['quay-lantern-home', 301.2, -175, 6.8, 7.4, east, 'canal-house'],
  ['quay-lantern-repair', 301.4, -187, 7.0, 7.2, east, 'workshop-house'],
  ['south-bank-porter', 301.4, -199, 6.8, 7.2, east, 'canal-house'],
  ['bridge-stock-house', 300.2, -209, 6.1, 6.8, east, 'storehouse'],

  ['east-ferry-home', 326.1, -98, 6.1, 8.0, west, 'canal-house'],
  ['ropewalk', 326.4, -109, 7.8, 9.0, west, 'workshop-house'],
  ['tin-repair', 326, -122, 7.0, 8.8, west, 'workshop-house'],
  ['lock-family', 325.9, -134, 6.2, 7.4, west, 'canal-house'],
  ['cloth-mender', 325.8, -146, 6.9, 8.6, west, 'workshop-house'],
  ['east-quay-house', 326.4, -158, 6.4, 8.4, west, 'canal-house'],
  ['scale-office', 326.8, -174, 7.0, 9.0, west, 'workshop-house'],
  ['loading-store', 327, -188, 10.2, 11.2, east, 'storehouse'],
  ['loading-store-wing', 336.5, -198, 4.9, 6.4, Math.PI, 'storehouse'],
  ['south-courier-home', 327, -204, 6.3, 8.0, west, 'canal-house'],

  ['alley-dyer', 345.4, -101, 7.1, 9.1, east, 'workshop-house'],
  ['alley-dyer-wing', 355.9, -104.2, 5.3, 6.8, Math.PI, 'storehouse'],
  ['workers-court-north', 345.9, -115, 6.3, 8.0, east, 'canal-house'],
  ['copper-apron', 345.8, -127, 7.3, 8.8, east, 'workshop-house'],
  ['bakers-court', 345.6, -140, 6.4, 7.9, east, 'canal-house'],
  ['mason-residence', 345.4, -152, 6.7, 8.2, east, 'canal-house'],
  ['yard-joinery', 346, -167, 8.1, 10.0, east, 'workshop-house'],
  ['yard-joinery-wing', 356.8, -170.8, 5.7, 6.8, Math.PI, 'storehouse'],
  ['stonecutters-home', 347, -184, 6.8, 8.8, east, 'canal-house'],
  ['workers-court-south', 347.2, -207, 6.6, 8.2, east, 'canal-house'],

  ['south-bank-house', 244, -242, 6.4, 8.0, 0, 'canal-house'],
  ['grain-receiver', 258, -241, 8.3, 10.1, 0, 'storehouse'],
  ['potters-yard', 274, -243, 7.4, 9.3, 0, 'workshop-house'],
  ['potters-yard-wing', 284.7, -246, 5.4, 7.2, east, 'storehouse'],
  ['south-loom-home', 298, -243, 6.1, 8.0, 0, 'canal-house'],
  ['bridgemans-home', 313.3, -242, 6.8, 8.7, 0, 'canal-house'],
  ['cart-repair', 328.4, -243, 7.8, 10.0, 0, 'workshop-house'],
  ['south-cask-yard', 344.5, -242, 8.7, 11.0, 0, 'storehouse'],
  ['south-cask-yard-wing', 356.5, -245, 5.1, 6.7, east, 'storehouse'],
  ['quay-end-home', 369, -241.5, 6.4, 8.2, 0, 'canal-house'],
];

/** The accepted M6.1 roads, water and terrain remain authoritative. Unseen uses are assumptions. */
export function createLowerCanal(blueprint: CityBlueprint): UrbanDistrict {
  if (!blueprint.districts.some(d => d.id === 'lower-canal')) throw new Error('Lower Canal requires the accepted city blueprint');
  const buildings = parcels.map(([id, x, z, width, depth, yaw, recipe, y], index) => {
    const b = urbanBuilding('lower-canal', id, x, z, width, depth, yaw, y ?? 4, recipe, index);
    // Neighboring households vary within the working-waterfront grammar, never across kit identities.
    if (recipe === 'canal-house') {
      b.floors = ['ferry-keeper', 'quay-bell-house', 'workers-court-south', 'bridgemans-home'].includes(id) ? 3 : 2;
      b.facade = (index % 3 === 0 ? 'cottage' : index % 3 === 1 ? 'narrow' : 'paired') as FacadeProfile;
      b.roof = index % 4 === 0 ? 'hip' : 'gable';
      b.bays = 2; b.balcony = y === 8 || index % 4 === 0;
    } else if (recipe === 'workshop-house') {
      b.roof = index % 3 === 0 ? 'hip' : 'gable';
      b.bays = width > 7.4 ? 3 : 2;
      b.awning = !['line-menders', 'tin-repair', 'yard-joinery'].includes(id);
    } else if (recipe === 'storehouse') {
      b.roof = id.includes('wing') ? 'gable' : 'hip';
      b.awning = !id.includes('wing');
      b.bays = width > 8 ? 3 : 2;
    }
    b.roofDirection = id.includes('wing') || ['ropewalk', 'sail-repair', 'grain-receiver', 'east-bank-resident'].includes(id) ? 1 : 0;
    if (id === 'cart-repair') b.roofColor = 0xa8613e;
    if (id === 'water-guild') {
      b.hero = true; b.roofColor = 0x3b7470; b.roofHeight = 3.25;
      b.floors = 2; b.floorHeight = 3.3; b.bays = 4; b.facade = 'paired';
      b.corner = 'stone'; b.shopfront = 'wide'; b.awning = false;
    }
    if (id.includes('wing')) { b.balcony = false; b.floors = 1; b.roofHeight = 1.65; }
    // Cliff-facing utility elevations have no usable rear apron, so they use windows.
    if (['guild-record-wing', 'quay-bell-house', 'sail-repair', 'upper-net-house', 'bridge-stock-house'].includes(id)) b.rearEntrance = false;
    return b;
  });

  const dressing: DistrictDressing[] = [];
  const add = (id: string, module: DistrictDressing['module'], at: Vec3,
    scale: [number, number, number] = [1, 1, 1], yaw = 0, collider?: Vec3, tint = 1) => {
    dressing.push({ id: `m7.lower-canal.dressing.${id}`, module, position: at, scale, yaw, tint, ...(collider ? { collider } : {}) });
  };
  const apron = (id: string, module: 'crate' | 'barrel' | 'basket', lateral: number, tint = 1) => {
    const b = buildings.find(b => b.id.endsWith(`.${id}`))!;
    const z = b.depth / 2 + .66;
    add(`${id}.stock`, module, p(b.position.x + Math.cos(b.yaw) * lateral + Math.sin(b.yaw) * z,
      b.position.z - Math.sin(b.yaw) * lateral + Math.cos(b.yaw) * z, b.position.y),
    [.72, .82, .72], b.yaw, { x: .62, y: .66, z: .52 }, tint);
  };
  for (const [id, module, side] of [
    ['reed-baskets', 'basket', -1.9], ['line-menders', 'basket', 2.0],
    ['small-boat-store', 'crate', 2.7], ['sail-repair', 'basket', -2.0],
    ['guild-cask-shed', 'barrel', 2.6], ['ropewalk', 'crate', -2.4],
    ['cloth-mender', 'basket', 2.0], ['alley-dyer', 'barrel', 2.1],
    ['copper-apron', 'crate', -2.2], ['yard-joinery', 'crate', 2.6],
    ['potters-yard', 'basket', -2.2], ['grain-receiver', 'crate', 2.5],
  ] as const) apron(id, module, side, .86);

  // Occupied loading pockets are off the protected roads and clear the central service doors.
  for (const [i, at] of [p(335.2, -183), p(337.2, -182.5), p(335.4, -196),
    p(351.1, -234.9), p(355, -235.3)].entries()) {
    add(`loading.${i}.crate`, 'crate', at, [.95, .94, .86], i % 2 ? .08 : -.09, { x: .92, y: .67, z: .66 }, .84);
    if (i < 3) add(`loading.${i}.upper`, 'crate', { ...at, y: at.y + .67 }, [.67, .68, .64], .05, undefined, .88);
  }
  add('loading.casks', 'barrel', p(338.7, -181.4), [.9, .98, .9], 0, { x: .66, y: .81, z: .66 }, .86);
  add('guild.receiving-baskets', 'basket', p(279.5, -140, 8), [.84, .82, .9], west, { x: .60, y: .48, z: .65 });
  add('guild.cask', 'barrel', p(279.6, -150, 8), [.81, .95, .81], 0, { x: .59, y: .79, z: .59 }, .87);
  add('guild.covered-load', 'crate', p(282.1, -155.3, 8), [.94, .94, .82], .08, { x: .91, y: .67, z: .62 }, .85);
  add('guild.folded-sails', 'goods-textiles', p(282.1, -155.3, 8.67), [.75, .75, .75], .08);
  add('guild.reserve-cask', 'barrel', p(283.0, -157, 8), [.8, .91, .8], 0, { x: .58, y: .76, z: .58 }, .88);
  // A compact all-side timber receiving hoist marks the guild's water-facing working edge.
  for (const [i, x] of [282.2, 284.8].entries())
    add(`guild.hoist-post.${i}`, 'post', p(x, -136.2, 8), [1.12, 3.3, 1.12], 0, { x: .20, y: 3.3, z: .20 }, .88);
  add('guild.hoist-crossbeam', 'beam', p(283.5, -136.2, 11.23), [3.0, 1.35, 1.2], 0, undefined, .86);
  add('guild.hoist-water-arm', 'beam', p(280.6, -136.2, 11.04), [4.6, 1.1, 1.15], 0, undefined, .90);
  add('ropewalk.work-cask', 'barrel', p(321.0, -105.9), [.84, .9, .84], 0, { x: .61, y: .74, z: .61 }, .84);
  add('ropewalk.folded-cloth', 'goods-textiles', p(321.0, -105.9, 4.74), [.57, .57, .57], .07);
  add('loading.stacked-planks', 'beam', p(335.4, -207.6), [4.0, 2.1, 2.2], 0, { x: 4.0, y: .40, z: .44 }, .86);
  add('loading.plank-top', 'beam', p(335.4, -207.6, 4.38), [3.7, 1.0, 1.7], .035, undefined, .91);
  add('joinery.long-stock', 'beam', p(352.5, -171), [3.2, 2.1, 2.25], east, { x: 3.2, y: .40, z: .45 }, .87);
  add('joinery.short-stock', 'beam', p(352.5, -171, 4.38), [2.7, 1.0, 1.7], east, undefined, .91);
  add('west.wash-barrel', 'barrel', p(243, -127), [.69, .8, .69], 0, { x: .50, y: .65, z: .5 });
  add('workers.bench', 'bench', p(338.4, -145), [.88, 1, .88], east, { x: .66, y: .84, z: 1.9 });
  add('south.bench', 'bench', p(305, -248), [.88, 1, .88], Math.PI, { x: 1.9, y: .84, z: .66 });

  // Mooring furniture belongs to the existing bank, never crosses the accepted water corridor.
  for (const [i, at] of [p(264.8, -108), p(262.3, -123), p(259.8, -137),
    p(280.2, -139, 8), p(257.3, -188, 8), p(256, -198, 8)].entries()) {
    add(`quay.${i}.mooring`, 'mooring', at, [.9, .9, .9], 0, { x: .31, y: .69, z: .31 }, .92);
  }

  const streets: UrbanDistrict['streets'] = [
    { id: 'm7.lower-canal.west-quay', width: 2.6, points: [p(262, -82), p(264, -99), p(264, -112), p(261, -127), p(259, -136), p(258, -149), p(247, -158)] },
    { id: 'm7.lower-canal.wash-alley', width: 2.3, points: [p(245, -87), p(245, -108), p(245, -127), p(245, -145), p(247, -158)] },
    { id: 'm7.lower-canal.east-service', width: 2.8, points: [p(336, -87), p(336, -117), p(336, -143), p(337, -161), p(337, -175)] },
    { id: 'm7.lower-canal.workers-lane', width: 2.7, points: [p(363, -90), p(363, -125), p(362, -149), p(363, -180), p(361, -216), p(361, -231)] },
    { id: 'm7.lower-canal.loading-cut', width: 2.4, points: [p(310, -165), p(319, -165), p(332, -165), p(337, -175), p(340.6, -178), p(340.6, -202), p(338, -226), p(315, -226)] },
    { id: 'm7.lower-canal.south-yard', width: 2.9, points: [p(315, -226), p(315, -232), p(296, -232), p(276, -232), p(257, -232), p(238, -232)] },
    { id: 'm7.lower-canal.guild-quay', width: 1.8, points: [p(275, -165, 8), p(275, -156, 8), p(278.5, -153, 8), p(279.2, -144, 8)] },
    { id: 'm7.lower-canal.cask-quay', width: 2.2, points: [p(279.4, -187, 8), p(273, -187, 8)] },
    { id: 'm7.lower-canal.cargo-dock', width: 1.8, points: [p(264, -112), p(272.65, -112), p(272.30625, -113.1), p(266.68125, -131.1, .6), p(265.43125, -135.1, .6)] },
  ];

  const surfaces: UrbanDistrict['surfaces'] = [];
  const patch = (id: string, x0: number, x1: number, z0: number, z1: number, y: number) => {
    surfaces.push({ id: `m7.lower-canal.surface.${id}`, color: 0x9f9c87,
      vertices: [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], indices: [0, 2, 1, 0, 3, 2] });
  };
  // Short quay entry spans the accepted 1.2m gap between the two district polygons.
  patch('gate-quay-entry', 257, 266, -84, -76, 4);
  patch('north-service-entry', 310, 338, -90, -85, 4);
  // The macro corridor cutter has a 20cm shoulder. These small doorway aprons seal it.
  patch('ferry-threshold', 315.6, 317.3, -100.3, -96.5, 4);
  patch('rope-threshold', 315.0, 316.7, -112.1, -108.7, 4);
  patch('sail-threshold', 313.3, 315.1, -149.1, -145.5, 4);
  patch('tinker-threshold', 314.8, 316.6, -124.8, -121.5, 4);
  patch('scale-office-threshold', 313.8, 314.5, -177, -173.5, 4);
  patch('south-courier-threshold', 316.7, 317.7, -206.1, -204.2, 4);
  patch('loading-road-shoulder', 312.8, 313.6, -166.4, -163.6, 4);
  patch('southern-bridge-shoulder', 313.8, 316.2, -219.4, -217.5, 4);
  patch('gate-bridge-shoulder', 259, 261, -69, -67.5, 4);
  patch('guild-stair-entry', 273.5, 275.9, -167.6, -161.8, 8);
  patch('cask-stair-entry', 277.6, 278.4, -191.2, -188.8, 8);
  patch('cask-level-entry', 277.0, 278.0, -188.1, -185.9, 8);
  // A small landing apron smooths the accepted corner cap's 22cm upward edge at the stair turn.
  // It remains inside the accepted stair corridor, below 1:5, with no water/terrain redesign.
  const stairStart = urbanFloorAt(blueprint, 279.6, -165)!;
  surfaces.push({ id: 'm7.lower-canal.surface.guild-stair-landing', color: 0xa69c84,
    vertices: [279.6, stairStart, -166.15, 276.9, 8, -166.15, 276.9, 8, -163.85, 279.6, stairStart, -163.85],
    indices: [0, 2, 1, 0, 3, 2] });
  const dockPath = streets.at(-1)!.points;
  const dockYaw = Math.atan2(dockPath[3]!.x - dockPath[2]!.x, dockPath[3]!.z - dockPath[2]!.z);
  const ribbon = (id: string, a: Vec3, b: Vec3, width: number) => {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    surfaces.push({ id: `m7.lower-canal.surface.${id}`, color: 0x8b7860,
      vertices: [a.x + nx, a.y, a.z + nz, b.x + nx, b.y, b.z + nz,
        b.x - nx, b.y, b.z - nz, a.x - nx, a.y, a.z - nz], indices: [0, 2, 1, 0, 3, 2] });
  };
  for (let i = 1; i < dockPath.length; i++) ribbon(`cargo-dock.${i}`, dockPath[i - 1]!, dockPath[i]!, i === 4 ? 2.0 : 1.8);
  patch('cargo-dock-end', 264.33, 266.53, -136.1, -134.1, .6);
  const dockStart = dockPath[2]!, dockEnd = dockPath[3]!, dockFinish = dockPath[4]!, dx = dockEnd.x - dockStart.x, dz = dockEnd.z - dockStart.z;
  const dockLength = Math.hypot(dx, dz), nx = -dz / dockLength, nz = dx / dockLength;
  for (let i = 0; i < 20; i++) {
    const t = (i + .5) / 20;
    add(`dock.tread.${i}`, 'stair', p(dockStart.x + dx * t, dockStart.z + dz * t, 4 - 3.4 * (i + 1) / 20),
      [1.8, .17 / .18, dockLength / 20 / .30], dockYaw, undefined, .83);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const t = (i + .5) / 9;
    add(`dock.rail.${side}.${i}`, 'railing', p(dockStart.x + dx * t + nx * side * .86,
      dockStart.z + dz * t + nz * side * .86, 4 - 3.4 * t), [dockLength / 9 / 2.14, .94, .88], dockYaw + Math.PI / 2,
    { x: dockLength / 9, y: 1.02, z: .14 }, .86);
  }
  for (const [i, at] of [p(dockEnd.x + nx * .88, dockEnd.z + nz * .88, .6),
    p(dockFinish.x + nx * .88, dockFinish.z + nz * .88, .6), p(dockFinish.x - nx * .88, dockFinish.z - nz * .88, .6)].entries()) {
    add(`dock.pier.${i}`, 'post', { ...at, y: -2.8 }, [1.8, 3.4, 1.8], 0, undefined, .83);
    add(`dock.mooring.${i}`, 'mooring', at, [.88, .88, .88], 0, { x: .3, y: .67, z: .3 }, .88);
  }
  add('dock.received-cask', 'barrel', p(265.9 + nx * .65, -133.6 + nz * .65, .6), [.62, .75, .62], 0, { x: .46, y: .62, z: .46 }, .85);
  add('dock.folded-net', 'goods-textiles', p(265.9 + nx * .65, -133.6 + nz * .65, 1.22), [.48, .48, .48], .08);
  const supportedBlueprint = { ...blueprint, terrain: [...blueprint.terrain, ...surfaces] };

  const nodes: Record<string, Vec3> = {}, edges: [string, string][] = [];
  const node = (id: string, at: Vec3) => { const key = `lc.${id}`; nodes[key] = { ...at, y: at.y + .012 }; return key; };
  const chain = (id: string, points: readonly Vec3[]) => points.map((at, index) => {
    const key = node(`${id}.${index}`, at); if (index) edges.push([`lc.${id}.${index - 1}`, key]); return key;
  });
  const spine = chain('spine', [p(315, -87), p(313.5, -115), p(312, -140), p(310, -165), p(312.5, -190), p(315, -215)]);
  // Small accepted corner caps flatten the last part of the stair turn; NPC feet follow actual support.
  const stepPoints = Array.from({ length: 36 }, (_, i) => {
    const at = p(310 - i, -165); at.y = urbanFloorAt(supportedBlueprint, at.x, at.z)!; return at;
  });
  const quaySteps = chain('steps', [...stepPoints, p(280, -190, 8)]);
  edges.push([spine[3]!, quaySteps[0]!]);
  const eastLane = chain('east', [p(336, -98), p(336, -122), p(336, -146), p(337, -161), p(337, -175)]);
  const loading = chain('loading', [p(337, -175), p(340.6, -178), p(340.6, -202), p(338, -226), p(315, -226), p(315, -232), p(296, -232), p(276, -232), p(257, -232), p(238, -232)]);
  const entry = chain('loading-entry', [p(310, -165), p(319, -165), p(332, -165), p(337, -175)]);
  edges.push([eastLane[4]!, loading[0]!], [spine[3]!, entry[0]!], [entry[3]!, eastLane[4]!], [spine[5]!, loading[4]!]);
  const workers = chain('workers', [p(363, -98), p(363, -125), p(362, -149), p(363, -180), p(361, -216), p(361, -231), p(338, -226)]);
  edges.push([workers[6]!, loading[3]!], [workers[0]!, node('north-cross', p(336, -87))], ['lc.north-cross', eastLane[0]!], ['lc.north-cross', spine[0]!]);
  const westLane = chain('west', [p(245, -87), p(245, -108), p(245, -127), p(245, -145), p(247, -158)]);
  const westQuay = chain('quay', streets[0]!.points);
  edges.push([westLane[4]!, westQuay[6]!], [westLane[0]!, westQuay[0]!]);
  const gate = chain('gate', [p(262, -82), p(260, -76), p(260, -65), p(285, -65), p(315, -65), p(315, -87)]);
  edges.push([westQuay[0]!, gate[0]!], [gate[5]!, spine[0]!]);
  const guildLane = chain('guild', [p(275, -165, 8), p(275, -156, 8), p(278.5, -153, 8), p(279.2, -144, 8)]);
  const caskLane = chain('cask', [p(279.4, -187, 8), p(273, -187, 8)]);
  edges.push([guildLane[0]!, quaySteps[35]!], [caskLane[0]!, quaySteps[36]!]);
  const dock = chain('dock', dockPath);
  edges.push([dock[0]!, westQuay[2]!]);

  // Household shelters connect by a perpendicular apron and a known service lane.
  const residents: readonly [building: string, lane: string[], index: number, role: string, name: string][] = [
    ['ferry-keeper', westQuay, 1, 'ferry keeper', 'Orin'], ['reed-baskets', westQuay, 1, 'basket maker', 'Leda'],
    ['line-menders', westQuay, 2, 'net mender', 'Sella'], ['west-bank-home', westQuay, 3, 'resident', 'Tavin'],
    ['coopers-home', westLane, 1, 'cooper', 'Bran'], ['west-wash-house', westLane, 2, 'resident', 'Mira'],
    ['east-ferry-home', spine, 0, 'porter', 'Demi'], ['ropewalk', spine, 1, 'rope maker', 'Nell'],
    ['tin-repair', spine, 1, 'tinker', 'Ivo'], ['cloth-mender', spine, 2, 'sail maker', 'Runa'],
    ['scale-office', spine, 3, 'weigher', 'Evan'], ['south-courier-home', spine, 4, 'courier', 'Sol'],
    ['alley-dyer', workers, 0, 'dyer', 'Tala'], ['bakers-court', workers, 2, 'resident', 'Pella'],
    ['yard-joinery', workers, 3, 'joiner', 'Aren'], ['workers-court-south', workers, 4, 'resident', 'Jessa'],
    ['grain-receiver', loading, 8, 'grain porter', 'Eda'], ['potters-yard', loading, 7, 'potter', 'Kellan'],
    ['water-guild', guildLane, 3, 'guild clerk', 'Olen'], ['guild-cask-shed', caskLane, 1, 'waterside worker', 'Nara'],
  ];
  const definitions: NpcDefinition[] = residents.map(([building, lane, index, role, name], i) => {
    const b = buildings.find(b => b.id.endsWith(`.${building}`))!;
    const offset = b.depth / 2 + .75, localX = -.18 * b.width;
    const shelterAt = p(b.position.x + Math.cos(b.yaw) * localX + Math.sin(b.yaw) * offset,
      b.position.z - Math.sin(b.yaw) * localX + Math.cos(b.yaw) * offset, b.position.y);
    const shelter = node(`shelter.${i}`, shelterAt), target = nodes[lane[index]!]!;
    const approach = node(`approach.${i}`, Math.abs(Math.sin(b.yaw)) > .5
      ? p(target.x, shelterAt.z, b.position.y) : p(shelterAt.x, target.z, b.position.y));
    edges.push([shelter, approach], [approach, lane[index]!]);
    const next = lane[Math.min(lane.length - 1, index + 1)]!, previous = lane[Math.max(0, index - 1)]!;
    return { id: `m7.lower-canal.local.${i.toString().padStart(2, '0')}`, name: `${name} · ${role}`,
      dialogue: role === 'resident' ? 'Our homes share the little working lanes. Keep the quay open for the porters.'
        : role.includes('porter') || role === 'weigher' ? 'The guild checks each load before it travels uphill. We use the stairs when the carts cannot pass.'
          : 'Most of our work stays beside the canal. The workshop doors open onto the service lane.',
      rainDialogue: 'The loading cloths are tied down. I will wait beneath these eaves until the rain eases.',
      eveningDialogue: 'The last load is counted. The bridge lamps show the way back to the gate.',
      dayRoute: i === 0 ? [shelter, lane[index]!, dock.at(-1)!, lane[index]!] : [shelter, lane[index]!, i % 2 ? previous : next],
      duskRoute: [lane[index]!, shelter], shelterNode: shelter,
      walkSpeed: .68 + (i % 5) * .043, idleSeconds: 5 + (i % 6) * 1.1, initialWait: .7 + (i * 1.71) % 11,
      appearance: { height: 1.57 + (i % 7) * .033,
        coat: [0x637466, 0x697265, 0x7a614b, 0x6c777b, 0x958775][i % 5]!,
        trousers: [0x514e43, 0x5e5244, 0x475354][i % 3]!, skin: [0xb78965, 0xd3a67e, 0x91664c, 0xe0b993][i % 4]!,
        hair: [0x3e3027, 0x776d5a, 0x594337][i % 3]!, hat: i % 3 !== 0, apron: role !== 'resident' && role !== 'courier',
        build: [.92, 1.04, .97, 1.11][i % 4]!, coatLength: .53 + (i % 3) * .04,
        hatStyle: 'cap', accessory: role === 'courier' ? 'satchel' : i % 4 === 0 ? 'shawl' : 'belt',
        accent: [0x8b795d, 0x526c70, 0x8e624b][i % 3]! } };
  });

  // Many tiny shoulder repairs remain one owned support mesh; the timber dock has its own material.
  const groupedSurfaces: UrbanDistrict['surfaces'] = [];
  for (const [id, filter, color] of [
    ['quay-links', (s: UrbanDistrict['surfaces'][number]) => !s.id.includes('cargo-dock') && !s.id.includes('guild-stair-landing'), 0x9f9c87],
    ['guild-stair-landing', (s: UrbanDistrict['surfaces'][number]) => s.id.includes('guild-stair-landing'), 0xa69c84],
    ['cargo-dock', (s: UrbanDistrict['surfaces'][number]) => s.id.includes('cargo-dock'), 0x8b7860],
  ] as const) {
    const combined = { id: `m7.lower-canal.surface.${id}`, color, vertices: [] as number[], indices: [] as number[] };
    for (const s of surfaces.filter(filter)) {
      const offset = combined.vertices.length / 3; combined.vertices.push(...s.vertices);
      combined.indices.push(...s.indices.map(i => i + offset));
    }
    groupedSurfaces.push(combined);
  }

  return {
    id: 'lower-canal', identity: 'Narrow working-waterfront households, small workshops, an inhabited upper quay and a guild receiving court.',
    buildings, dressing,
    stalls: [{ x: 352.8, y: 4, z: -219.6, yaw: Math.PI, cloth: 0x68776e, width: .88, depth: .86, goods: 'goods-produce' },
      { x: 331.8, y: 4, z: -221.2, yaw: 0, cloth: 0x938063, width: .9, depth: .8, goods: 'goods-pottery' }],
    lamps: [[260, 6.5, -88], [259, 6.5, -127], [277.9, 10.6, -152], [282.5, 10.6, -183],
      [319.7, 6.5, -162], [340, 6.5, -174], [363.5, 6.5, -207.5], [296, 6.5, -231]],
    gardens: [
      { id: 'lc.west-repair-yard', position: p(232.5, -161), radius: 1.7, tree: 'tree-alder-0', scale: .52 },
      { id: 'lc.guild-court', position: p(287, -171.8, 8), radius: 1.2, tree: 'tree-alder-1', scale: .43 },
      { id: 'lc.north-workers-yard', position: p(350.9, -90.8), radius: 1.8, tree: 'tree-orchard-1', scale: .48 },
      { id: 'lc.loading-court-edge', position: p(352, -199.5), radius: 1.8, tree: 'tree-alder-1', scale: .50 },
      { id: 'lc.south-waterbank', position: p(233, -216), radius: 1.5, tree: 'tree-alder-0', scale: .58 },
      { id: 'lc.south-household-yard', position: p(295, -254), radius: 1.8, tree: 'tree-orchard-1', scale: .45 },
    ],
    streets, surfaces: groupedSurfaces,
    handoffs:[{id:'north-quay',neighbor:'south-gate',position:p(260,-76.4),inward:p(2,-6,0),width:9,approachRadius:30}],
    route: [p(310, -165), p(315, -87), p(315, -65), p(285, -65), p(260, -65), p(260, -76), p(262, -82), p(264, -99),
      ...dockPath, ...dockPath.slice(0, -1).reverse(), p(264, -99), p(262, -82), p(260, -76), p(260, -65), p(285, -65), p(315, -65), p(315, -87),
      p(310, -165), p(319, -165), p(332, -165), p(337, -175), p(340.6, -178), p(340.6, -202),
      p(338, -226), p(315, -226), p(315, -232), p(296, -232), p(276, -232), p(257, -232), p(238, -232),
      p(257, -232), p(276, -232), p(296, -232), p(315, -232), p(315, -215), p(310, -165),
      ...stepPoints.slice(1), p(275, -156, 8), p(278.5, -153, 8), p(279.2, -144, 8),
      p(278.5, -153, 8), p(275, -156, 8), p(275, -165, 8), p(280, -190, 8), p(279.4, -187, 8), p(273, -187, 8),
      p(279.4, -187, 8), p(280, -190, 8), p(275, -165, 8), ...stepPoints.slice(0, -1).reverse()],
    views: {
      street: { position: p(279.2, -147, 8), yaw: Math.PI, pitch: -.05 },
      alley: { position: p(336, -143), yaw: 0, pitch: -.04 },
      doorway: { position: p(279.2, -145, 8), yaw: -Math.PI/2, pitch: -.03 },
      hero: { position: p(278.5, -155, 8), yaw: -Math.PI * .75, pitch: .20 },
      quay: { position: p(260, -120), yaw: -Math.PI / 2, pitch: -.07 },
      bridge: { position: p(315, -213, 4.12), yaw: Math.PI * .55, pitch: .03 },
      dock: { position: p(265.9, -133.6, .6), yaw: 0, pitch: -.02 },
    },
    eagle: { position: p(421, -45, 160), target: p(293, -165, 6), fov: 44 },
    npcs: { nodes, edges, definitions },
    ambience: { market: .24, workshop: .82, river: .86, position: p(279, -163, 8) },
    assumptions: [
      'Named households, trades and narrow service lanes are coherent inventions for unseen street-level detail; they are not measured from the reference.',
      'Separate low wings form dyer, joiner, potter and storehouse compounds while retaining simple serializable collision footprints.',
      'The 8m guild quay uses the accepted inhabited-quay terrace and stair road; no accepted water datum, terrain cut, bridge or macro route is moved.',
      'The short north-quay entry reuses the accepted South Gate approach. Its supported local guard and 30m lease-retention approach prevent entering detail support before collision activation.',
      'One timber cargo dock at .6m stands above the accepted -1.16m water. Its shallow stair run follows outside the existing bank face; the bank, river graph and water width remain unchanged.',
    ],
  };
}
