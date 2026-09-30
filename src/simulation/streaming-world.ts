import { createDistrictCourse } from './district';
import { DISTRICT } from './district-layout';
import { DISTRICT_NPC_DEFINITIONS } from './district-npcs';
import { NPC_DEFINITIONS } from './npcs';
import { createRuralCourse } from './rural';
import type { WorldArea } from './streaming-contracts';
import type { BoxSpec, CourseSpec, Vec3 } from './types';

type Surface = NonNullable<CourseSpec['surfaces']>[number];
function floor(id: string, minX: number, maxX: number, minZ: number, maxZ: number): Surface {
  return { id, color: 0xb8ad8f, vertices: [minX, 4, minZ, maxX, 4, minZ, maxX, 4, maxZ, minX, 4, maxZ],
    indices: [0, 2, 1, 0, 3, 2] };
}
const point = (x: number, z: number): Vec3 => ({ x, y: 4, z });

/** Third area is an explicitly plain handoff fixture, not a new art district. */
function createNeighborShell(): CourseSpec {
  const boxes: BoxSpec[] = [];
  for (const [index, [x, z, width, depth, height]] of [
    [162, -27, 8, 7, 3.4], [185, -32, 9, 8, 4], [208, -26, 7, 7, 3.6],
  ].entries()) {
    boxes.push({ id: `shell.workshop.${index}.wall`, position: { x, y: 4 + height / 2, z },
      size: { x: width, y: height, z: depth }, color: index === 1 ? 0xcabc91 : 0xd6c3a0, collides: true });
    const pitch = Math.atan(0.5), halfSpan = depth / 2 + 0.5;
    for (const side of [-1, 1]) boxes.push({ id: `shell.workshop.${index}.roof.${side}`,
      position: { x, y: 4 + height + halfSpan * 0.25, z: z + side * halfSpan / 2 },
      size: { x: width + 0.8, y: 0.2, z: halfSpan / Math.cos(pitch) }, rotationX: side * pitch,
      color: index === 1 ? 0x874733 : 0xa9512b, collides: false });
  }
  return { id: 'm5-neighbor-shell', seed: DISTRICT.seed, bounds: 226,
    spawn: { x: 206, y: 4.04, z: -10 }, boxes,
    surfaces: [floor('shell.ground.top', 146, 218, -48, 1)], labels: [], bookmarks: {} };
}

export function createStreamingWorld() {
  const rural = createRuralCourse();
  const district = createDistrictCourse();
  // createDistrictCourse contains rural data; only the district additions belong
  // to the market chunk. No copies of rural colliders or locals live in it.
  const market: CourseSpec = { ...district,
    boxes: district.boxes.filter(box => box.id.startsWith('district.')),
    surfaces: district.surfaces!.filter(surface => surface.id.startsWith('district.')) };
  const shell = createNeighborShell();
  const areas: WorldArea[] = [
    { id: 'rural', bounds: { minX: -48, maxX: 48, minZ: -48, maxZ: 48 }, course: rural,
      assetIds: ['rural.cottage', 'rural.shed', 'rural.bridge'],
      npcIds: NPC_DEFINITIONS.map(npc => npc.id) },
    { id: 'river-market', bounds: { ...DISTRICT.extent }, course: market,
      assetIds: ['district.kit'], npcIds: DISTRICT_NPC_DEFINITIONS.map(npc => npc.id) },
    { id: 'neighbor-shell', bounds: { minX: 146, maxX: 218, minZ: -48, maxZ: 1 }, course: shell,
      assetIds: [], npcIds: [] },
  ];
  const course: CourseSpec = { ...district, id: 'm5-streaming-proof', bounds: 226,
    spawn: { ...rural.spawn }, boxes: areas.flatMap(area => area.course.boxes),
    surfaces: areas.flatMap(area => area.course.surfaces ?? []),
    bookmarks: { ...district.bookmarks, spawn: rural.bookmarks.spawn!,
      shell: { position: { x: 206, y: 4.04, z: -10 }, yaw: Math.PI / 2, pitch: -0.04 },
      streamingRural: { position: { x: -6, y: 4.04, z: -10 }, yaw: -Math.PI / 2, pitch: -0.04 } } };
  // Only narrow, fixed handoff floors stay resident. The large accepted area
  // terrain remains transient and is owned by its area's collider lease.
  const residentCourse: CourseSpec = { ...course, id: 'm5-resident-handoffs', boxes: [], labels: [],
    surfaces: [floor('resident.rural-market-handoff', 36, 60, -15, -5),
      floor('resident.market-shell-handoff', 134, 158, -15, -5)] };
  // Around the cottage's front/east side, then the accepted primary street.
  const outward = [{ ...rural.spawn }, point(5, -1), point(5, -10), point(38, -10),
    point(52, -10), point(69, -9), point(89, -12), point(111, -11), point(145, -10), point(206, -10)];
  const route = [...outward, ...outward.slice(0, -1).reverse()];
  return { course, areas, residentCourse, route };
}
