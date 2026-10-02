import { createCityBlueprint, cityRoadSurfaces } from './city-blueprint';
import type { CityBlueprint } from './city-contracts';
import { createStreamingWorld } from './streaming-world';
import { areaDistance } from './streaming-contracts';
import type { AreaId, WorldArea } from './streaming-contracts';
import type { BoxSpec, CourseSpec, Vec3 } from './types';
import { cityRetainingSurface } from './city-terrain';
import { cityBridgeSpans } from './city-navigation';

/** Original accepted area courses are anchored without transforms or remodeling. */
export function createCityWorld() {
  const blueprint = createCityBlueprint();
  const accepted = createStreamingWorld();
  const areas: WorldArea[] = blueprint.districts.map(district => {
    const existing = accepted.areas.find(area => area.id === district.acceptedArea);
    const xs = district.footprint.map(point => point.x), zs = district.footprint.map(point => point.z);
    return {
      id: district.id, bounds: existing?.bounds ?? { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
      course: existing?.course ?? { id: `m6.${district.id}`, seed: blueprint.seed, bounds: 850,
        spawn: { ...district.center, y: district.center.y + .04 }, boxes: blueprint.massing[district.id], surfaces: [], labels: [], bookmarks: {} },
      assetIds: existing?.assetIds ?? [], npcIds: existing?.npcIds ?? [],
      footprint: district.footprint, neighbors: district.neighbors, streamingPriority: district.streamingPriority,
    };
  });
  const residentCourse: CourseSpec = { ...accepted.residentCourse, id: 'm6-resident-topology', bounds: 850,
    boxes: [...blueprint.landmarks.filter(box => box.collides), ...cityBridgeSpans(blueprint).flatMap((span,index)=>{
      const dx=span.b.x-span.a.x,dz=span.b.z-span.a.z,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
      const middle={x:(span.a.x+span.b.x)/2,y:(span.a.y+span.b.y)/2,z:(span.a.z+span.b.z)/2};
      return [-1,1].map(side=>({id:`city.bridge.rail.${index}.${side}`,position:{
        x:middle.x+Math.cos(yaw)*side*(span.width/2-.12),y:middle.y+.55,z:middle.z-Math.sin(yaw)*side*(span.width/2-.12)},
        size:{x:.24,y:1.1,z:length},rotationY:yaw,color:0xb5aa8e,collides:true,visible:false}));
    })], labels: [], bookmarks: {},
    surfaces: [...accepted.residentCourse.surfaces!, ...blueprint.terrain, cityRetainingSurface(blueprint.terrain,cityRoadSurfaces(blueprint.roads)), ...cityRoadSurfaces(blueprint.roads)] };
  const bookmarks = { ...accepted.course.bookmarks };
  for (const district of blueprint.districts) bookmarks[`city.${district.id}`] = {
    position: { ...district.center, y: district.center.y + .04 }, yaw: 0, pitch: .06,
  };
  const course: CourseSpec = { ...accepted.course, id: blueprint.id, bounds: 850,
    boxes: [...residentCourse.boxes, ...areas.flatMap(area => area.course.boxes)],
    surfaces: [...residentCourse.surfaces!, ...accepted.areas.flatMap(area => area.course.surfaces ?? [])],
    labels: [], bookmarks };
  return { blueprint, areas, residentCourse, course, route: blueprint.route,
    acceptedCourses: accepted.areas.map(area => area.course) };
}

/** At a fork, demand follows a connected neighbor toward velocity lookahead.
 * Nearby unconnected polygons cannot consume the second preparation slot. */
export function cityDemand(areas: readonly WorldArea[], position: Vec3, velocity: Vec3): AreaId[] {
  const nearest = [...areas].sort((a, b) => areaDistance(a, position) - areaDistance(b, position) ||
    Math.hypot(position.x - a.course.spawn.x, position.z - a.course.spawn.z) -
    Math.hypot(position.x - b.course.spawn.x, position.z - b.course.spawn.z))[0]!;
  const projected = { x: position.x + velocity.x * 10, y: position.y, z: position.z + velocity.z * 10 };
  const neighbors = areas.filter(area => nearest.neighbors?.includes(area.id));
  // Keep the outgoing neighbor until the whole capsule has cleared its portal.
  // Otherwise a new reverse guard can appear ahead of a just-crossed player.
  neighbors.sort((a, b) => {
    const closeA=areaDistance(a,position)<=2,closeB=areaDistance(b,position)<=2;
    return Number(closeB)-Number(closeA) || areaDistance(a, projected) - areaDistance(b, projected) ||
    (a.streamingPriority ?? 0) - (b.streamingPriority ?? 0);
  });
  return [nearest.id, ...(neighbors[0] ? [neighbors[0].id] : [])];
}

/** Each connector has one unavailable-destination guard, independent of the
 * visual debug graph. Resident ground under it prevents an unloaded-floor fall. */
const portalCache = new WeakMap<CityBlueprint, Map<string, BoxSpec>>();
export function citySafetyGates(blueprint: CityBlueprint, activeIds: readonly string[], position: Vec3): BoxSpec[] {
  let portals=portalCache.get(blueprint);
  if(!portals){portals=new Map();portalCache.set(blueprint,portals);}
  return blueprint.connections.flatMap(connection => {
    const points = connection.points;
    if (points.length < 2) return [];
    const index = Math.floor(points.length / 2);
    const a = points[index - 1]!, b = points[index]!;
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const dx = b.x - a.x, dz = b.z - a.z;
    const onFromSide = (position.x - middle.x) * dx + (position.z - middle.z) * dz < 0;
    const destination = onFromSide ? connection.to : connection.from;
    if (activeIds.includes(destination)) return [];
    const key=`${connection.id}.${destination}`;
    const existing=portals!.get(key);if(existing)return [existing];
    // A guard in the middle of a long bridge could lie outside the 44m
    // activation band and deadlock a ready destination. Place it just before
    // the destination footprint, reached from either end of the connector.
    const district = blueprint.districts.find(item=>item.id===destination)!;
    const distanceArea = { id: district.id, bounds: {minX:0,maxX:0,minZ:0,maxZ:0}, footprint: district.footprint,
      course: {} as CourseSpec, assetIds: [], npcIds: [] };
    const directed = onFromSide ? points : [...points].reverse();
    let gateA = directed[0]!, gateB = directed[1]!, gate = { ...gateA };
    for (let segment=1;segment<directed.length;segment++) {
      gateA=directed[segment-1]!;gateB=directed[segment]!;
      if (areaDistance(distanceArea,gateB)>.45) continue;
      let lo=0,hi=1;
      for(let step=0;step<18;step++) {
        const t=(lo+hi)/2;
        const point={x:gateA.x+(gateB.x-gateA.x)*t,y:gateA.y+(gateB.y-gateA.y)*t,z:gateA.z+(gateB.z-gateA.z)*t};
        if(areaDistance(distanceArea,point)>.45)lo=t;else hi=t;
      }
      gate={x:gateA.x+(gateB.x-gateA.x)*lo,y:gateA.y+(gateB.y-gateA.y)*lo,z:gateA.z+(gateB.z-gateA.z)*lo};break;
    }
    const guard:BoxSpec={ id: `city.guard.${key}`, position: { x: gate.x, y: gate.y + 2.5, z: gate.z },
      size: { x: connection.width + 1, y: 5, z: .3 }, rotationY: Math.atan2(gateB.x-gateA.x, gateB.z-gateA.z), color: 0, collides: true, visible: false };
    portals!.set(key,guard);return [guard];
  });
}
