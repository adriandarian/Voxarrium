import { createCityBlueprint, cityRoadSurfaces } from './city-blueprint';
import type { CityBlueprint } from './city-contracts';
import { createStreamingWorld } from './streaming-world';
import { areaDistance } from './streaming-contracts';
import type { AreaId, WorldArea } from './streaming-contracts';
import type { BoxSpec, CourseSpec, Vec3 } from './types';
import { cityRetainingSurface } from './city-terrain';
import { cityBridgeSpans } from './city-navigation';
import { createUrbanDistricts, urbanCourse, urbanEntrances } from './urban-world';
import type { UrbanDistrict } from './urban-contracts';

/** Original accepted area courses are anchored without transforms or remodeling. */
export function createCityWorld(production=false) {
  const blueprint = createCityBlueprint();
  const urban=production?createUrbanDistricts(blueprint):[];
  const replacedLandmarks=production?['city.landmark.market-belfry']:[];
  const entrances=urban.flatMap(urbanEntrances);
  const accepted = createStreamingWorld();
  const areas: WorldArea[] = blueprint.districts.map(district => {
    const existing = accepted.areas.find(area => area.id === district.acceptedArea);
    const content=urban.find(u=>u.id===district.id);
    const xs = district.footprint.map(point => point.x), zs = district.footprint.map(point => point.z);
    return {
      id: district.id, bounds: existing?.bounds ?? { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
      course: existing?.course ?? (content?urbanCourse(content,blueprint.seed):{ id: `m6.${district.id}`, seed: blueprint.seed, bounds: 850,
        spawn: { ...district.center, y: district.center.y + .04 }, boxes: blueprint.massing[district.id], surfaces: [], labels: [], bookmarks: {} }),
      assetIds: existing?.assetIds ?? (content?['district.kit']:[]), npcIds: existing?.npcIds ?? content?.npcs.definitions.map(n=>n.id) ?? [],
      ...(content?{urban:content}:{}),
      footprint: district.footprint, neighbors: district.neighbors, streamingPriority: district.streamingPriority,
    };
  });
  const residentCourse: CourseSpec = { ...accepted.residentCourse, id: 'm6-resident-topology', bounds: 850,
    boxes: [...blueprint.landmarks.filter(box => box.collides && !replacedLandmarks.includes(box.id)), ...cityBridgeSpans(blueprint).flatMap((span,index)=>{
      const dx=span.b.x-span.a.x,dz=span.b.z-span.a.z,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
      const middle={x:(span.a.x+span.b.x)/2,y:(span.a.y+span.b.y)/2,z:(span.a.z+span.b.z)/2};
      return [-1,1].map(side=>({id:`city.bridge.rail.${index}.${side}`,position:{
        x:middle.x+Math.cos(yaw)*side*(span.width/2-.12),y:middle.y+.55,z:middle.z-Math.sin(yaw)*side*(span.width/2-.12)},
        size:{x:.24,y:1.1,z:length},rotationY:yaw,color:0xb5aa8e,collides:true,visible:false}));
    })], labels: [], bookmarks: {},
    surfaces: [...accepted.residentCourse.surfaces!, ...blueprint.terrain, cityRetainingSurface(blueprint.terrain,cityRoadSurfaces(blueprint.roads)), ...cityRoadSurfaces(blueprint.roads)] };
  const bookmarks = { ...accepted.course.bookmarks };
  for(const area of areas)Object.assign(bookmarks,area.course.bookmarks);
  for (const district of blueprint.districts) bookmarks[`city.${district.id}`] = {
    position: { ...district.center, y: district.center.y + .04 }, yaw: 0, pitch: .06,
  };
  const course: CourseSpec = { ...accepted.course, id: production?'m7-urban-districts':blueprint.id, bounds: 850,
    boxes: [...residentCourse.boxes, ...areas.flatMap(area => area.course.boxes)],
    surfaces: [...residentCourse.surfaces!, ...areas.flatMap(area => area.course.surfaces ?? [])],
    labels: [], bookmarks };
  if(production)blueprint.cameras.push(...urban.map(u=>({id:`m7-${u.id}`,...u.eagle})));
  return { blueprint, areas, residentCourse, course, route: blueprint.route,urban,entrances,replacedLandmarks,
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
    // A production service route can turn back through a nearby local portal.
    // Retain that connected ward across its authored approach instead of evicting
    // it for an unrelated velocity projection just before entering its support.
    const close=(area:WorldArea)=>areaDistance(area,position)<=2||!!area.urban?.handoffs?.some(h=>
      h.neighbor===nearest.id&&Math.hypot(position.x-h.position.x,position.z-h.position.z)<=h.approachRadius);
    const closeA=close(a),closeB=close(b);
    return Number(closeB)-Number(closeA) || areaDistance(a, projected) - areaDistance(b, projected) ||
    (a.streamingPriority ?? 0) - (b.streamingPriority ?? 0);
  });
  return [nearest.id, ...(neighbors[0] ? [neighbors[0].id] : [])];
}

/** Need timing includes local guards reached before the macro footprint. Exact
 * crossing remains the unchanged authored polygon, reported separately. */
export function cityBoundaryDistance(area:WorldArea,position:Vec3,urban:readonly UrbanDistrict[]):number{
  let distance=areaDistance(area,position);
  for(const d of urban)for(const h of d.handoffs??[]){
    const length=Math.hypot(h.inward.x,h.inward.z),dx=position.x-h.position.x,dz=position.z-h.position.z;
    const signed=(dx*h.inward.x+dz*h.inward.z)/length;
    const destination=signed>0?h.neighbor:d.id;
    const lateral=Math.abs((dx*h.inward.z-dz*h.inward.x)/length);
    if(destination===area.id&&lateral<=h.width/2)distance=Math.min(distance,Math.abs(signed));
  }
  return distance;
}

/** Each connector has one unavailable-destination guard, independent of the
 * visual debug graph. Resident ground under it prevents an unloaded-floor fall. */
const portalCache = new WeakMap<CityBlueprint, Map<string, BoxSpec>>();
export function citySafetyGates(blueprint: CityBlueprint, activeIds: readonly string[], position: Vec3,urban:readonly UrbanDistrict[]=[]): BoxSpec[] {
  let portals=portalCache.get(blueprint);
  if(!portals){portals=new Map();portalCache.set(blueprint,portals);}
  const macro=blueprint.connections.flatMap(connection => {
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
    // Secondary stairs can terminate on another resident connector just outside
    // the destination polygon. In that case guard the far join, never the origin
    // (which would put the unavailable neighbor's gate inside the active ward).
    let gateA = directed[0]!, gateB = directed[1]!, gate = { ...directed.at(-1)! };
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
  const local=urban.flatMap(d=>d.handoffs?.flatMap(h=>{
    const inside=(position.x-h.position.x)*h.inward.x+(position.z-h.position.z)*h.inward.z>0;
    const destination=inside?h.neighbor:d.id;
    if(activeIds.includes(destination))return [];
    return [{id:`m7.guard.${d.id}.${h.id}.${destination}`,position:{...h.position,y:h.position.y+2.5},
      size:{x:h.width+1,y:5,z:.3},rotationY:Math.atan2(h.inward.x,h.inward.z),color:0,collides:true,visible:false}];
  })??[]);
  return [...macro,...local];
}
