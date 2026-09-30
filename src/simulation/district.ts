import { DISTRICT, DISTRICT_BUILDINGS, DISTRICT_GARDENS } from './district-layout';
import { DISTRICT_DRESSING, DISTRICT_LAMPS, DISTRICT_STALLS } from './district-art';
import { createRuralCourse } from './rural';
import type { BoxSpec, CourseSpec, Vec3 } from './types';

type Surface = NonNullable<CourseSpec['surfaces']>[number];
const stone = 0x9a937a;

/** Closed external doors retain stable future interior hooks, in world meters. */
export const DISTRICT_ENTRANCES = DISTRICT_BUILDINGS.map(building => ({
  id: `${building.id}.entrance`, buildingId: building.id, closed: true as const,
  position: {
    x: building.position.x + Math.sin(building.yaw) * (building.depth / 2 + 1),
    y: building.position.y,
    z: building.position.z + Math.cos(building.yaw) * (building.depth / 2 + 1),
  },
  yaw: building.yaw,
}));

/** M4 adds one authored district; the accepted rural collision data stays intact. */
export function createDistrictCourse(): CourseSpec {
  const rural = createRuralCourse();
  const boxes = rural.boxes;
  const surfaces = rural.surfaces!;
  const add = (id: string, position: Vec3, size: Vec3, visible = false, color = stone): BoxSpec => {
    const box: BoxSpec = { id: `district.${id}`, position, size, color, collides: true, visible };
    boxes.push(box);
    return box;
  };
  const ground = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, y: number, bottom: number) => {
    const top: Surface = {
      id: `district.ground.${id}.top`, color: 0xb8ad8f,
      vertices: [minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ],
      indices: [0, 2, 1, 0, 3, 2],
    };
    const edge: Surface = { id: `district.ground.${id}.edge`, color: stone, vertices: [], indices: [] };
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const a = top.vertices.slice(i * 3, i * 3 + 3);
      const b = top.vertices.slice(next * 3, next * 3 + 3);
      const offset = edge.vertices.length / 3;
      edge.vertices.push(...a, ...b, a[0]!, bottom, a[2]!, b[0]!, bottom, b[2]!);
      edge.indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
    surfaces.push(top, edge);
  };
  ground('city', 48, 146, -48, 1, 4, 0);
  ground('quay', 48, 146, 1, 12, 0, -4);
  ground('south-bank', 48, 146, 26, 48, 0, -4);
  // The civic apron gives the guild a real raised foundation and external access.
  ground('civic', 121, 139, -46, -32.4, 5.2, 4);

  for (const stair of DISTRICT.stairs) {
    for (let step = 0; step < stair.count; step++) {
      const civic = stair.id === 'civic';
      const height = civic ? (step + 1) * stair.rise : (stair.count - step) * stair.rise;
      const bottom = civic ? 4 : 0;
      add(`stairs.${stair.id}.${step}`, {
        x: stair.x, y: bottom + height / 2, z: stair.z + step * stair.tread,
      }, { x: stair.width, y: height, z: Math.abs(stair.tread) }, true, step % 3 ? stone : 0xa59e84);
    }
  }

  for (const building of DISTRICT_BUILDINGS) {
    const height = building.floors * building.floorHeight;
    const body = add(`${building.id.slice('district.'.length)}.collider`, {
      x: building.position.x, y: building.position.y + height / 2, z: building.position.z,
    }, { x: building.width, y: height, z: building.depth }, false, building.plaster);
    body.rotationY = building.yaw;
    const step = add(`${building.id.slice('district.'.length)}.threshold.collider`, {
      x: building.position.x + Math.sin(building.yaw) * (building.depth / 2 + 0.22),
      y: building.position.y + 0.09,
      z: building.position.z + Math.cos(building.yaw) * (building.depth / 2 + 0.22),
    }, { x: 1.45, y: 0.18, z: 0.65 });
    step.rotationY = building.yaw;
  }

  // Counter proxies keep the functional stalls solid while their covered
  // merchant positions and the central crossing stay unobstructed.
  for (const [i, stall] of DISTRICT_STALLS.entries()) {
    add(`market-stall.${i}.counter.collider`, { x: stall.x, y: 4.47, z: stall.z },
      { x: 2.62*stall.width, y: 0.94, z: 1.52*stall.depth });
  }
  for (const [i,[x,,z]] of DISTRICT_LAMPS.slice(0,2).entries())
    add(`street-lamp.${i}.collider`,{x,y:5.3,z},{x:.20,y:2.6,z:.20});
  for (const [i, garden] of DISTRICT_GARDENS.entries()) if (garden.tree) {
    add(`garden-tree.${i}.collider`, { x: garden.x, y: garden.y + garden.scale * 1.55, z: garden.z },
      { x: garden.scale * .66, y: garden.scale * 3.1, z: garden.scale * .66 });
  }

  for (const prop of DISTRICT_DRESSING) if (prop.collider) {
    const proxy = add(prop.id.slice('district.'.length), {
      ...prop.position, y: prop.position.y + prop.collider.y / 2,
    }, prop.collider);
    proxy.rotationY = prop.yaw;
  }
  for (const bridge of DISTRICT.bridges) {
    add(`bridge.${bridge.id}.deck.collider`, { x: bridge.x, y: bridge.y - 0.18, z: bridge.z },
      { x: bridge.width, y: 0.36, z: bridge.length });
    for (const side of [-1, 1]) {
      add(`bridge.${bridge.id}.rail.${side}.collider`, {
        x: bridge.x + side * (bridge.width / 2 - 0.13), y: bridge.y + 0.575, z: bridge.z,
      }, { x: 0.26, y: 1.15, z: bridge.length - 0.35 });
    }
  }
  // Canal parapets end outside each deck's full opening; neither landing is gated.
  for (const [bank, z] of [['north', 11.84], ['south', 26.16]] as const) {
    let start = DISTRICT.extent.minX;
    for (const [index, bridge] of DISTRICT.bridges.entries()) {
      const end = bridge.x - bridge.width / 2 - 0.20;
      add(`canal.${bank}.${index}.collider`, { x: (start + end) / 2, y: 0.525, z },
        { x: end - start, y: 1.05, z: 0.32 });
      start = bridge.x + bridge.width / 2 + 0.20;
    }
    add(`canal.${bank}.2.collider`, { x: (start + DISTRICT.extent.maxX) / 2, y: 0.525, z },
      { x: DISTRICT.extent.maxX - start, y: 1.05, z: 0.32 });
  }

  return {
    ...rural, id: DISTRICT.id, seed: DISTRICT.seed, bounds: DISTRICT.bounds, boxes, surfaces,
    spawn: { x: 63, y: 4.04, z: -9.3 },
    bookmarks: {
      ...rural.bookmarks,
      ruralSpawn: rural.bookmarks.spawn!,
      spawn: { position: { x: 63, y: 4.04, z: -9.3 }, yaw: -Math.PI / 2, pitch: -0.06 },
      primaryStreet: { position: { x: 63, y: 4.04, z: -9.3 }, yaw: -Math.PI / 2, pitch: -0.06 },
      alley: { position: { x: 112, y: 4.04, z: -24 }, yaw: Math.PI, pitch: 0.02 },
      market: { position: { x: 89, y: 4.04, z: -10 }, yaw: 0, pitch: -0.03 },
      canal: { position: { x: 96, y: 0.04, z: 10.5 }, yaw: Math.PI, pitch: -0.1 },
      civic: { position: { x: 130, y: 5.24, z: -32.65 }, yaw: 0, pitch: 0.1 },
      southQuay: { position: { x: 112, y: 0.04, z: 29 }, yaw: Math.PI / 2, pitch: 0.02 },
      ruralEdge: { position: { x: 38, y: 4.04, z: -10 }, yaw: -Math.PI / 2, pitch: -0.03 },
    },
  };
}
