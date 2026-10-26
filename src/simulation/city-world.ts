import { createCityBlueprint, cityRoadSurfaces } from './city-blueprint';
import type { CityBlueprint } from './city-contracts';
import { createStreamingWorld } from './streaming-world';
import { areaDistance } from './streaming-contracts';
import type { AreaId, WorldArea } from './streaming-contracts';
import type { BoxSpec, CourseSpec, Vec3 } from './types';
import { cityRetainingSurface, cityUpperRetainingSurface, cityUpperRoadCoping } from './city-terrain';
import { cityBridgeSpans } from './city-navigation';
import { createUrbanDistricts, urbanCourse, urbanEntrances } from './urban-world';
import type { UrbanDistrict } from './urban-contracts';
import { cityCoreRoute, CITY_CORE_IDS, CITY_CORE_PREPARATION_LEAD_SECONDS, CITY_CORE_COLD_SECONDS, CITY_CORE_PROXY_APPROACH_METERS } from './city-core';
import { urbanNamespace } from './urban-grammar';
import { createCitadel } from './citadel';
import { UPPER_REPLACED_LANDMARKS } from './upper-city';
import { citadelActivity, upperCityRoute, UPPER_CITY_IDS, UPPER_CITY_COLD_SECONDS } from './upper-city-integration';

/** Original accepted area courses are anchored without transforms or remodeling. */
export function createCityWorld(production:boolean|'core'|'upper'=false) {
  const blueprint = createCityBlueprint();
  const upper=production==='upper',core=production==='core'||upper;
  const citadel=upper?createCitadel(blueprint):null;
  const urban=production?createUrbanDistricts(blueprint,core,upper):[];
  if(citadel)urban.push(citadelActivity(citadel));
  const replacedLandmarks=production?['city.landmark.market-belfry',...(core?['city.landmark.civic-hall','city.landmark.south-gate-tower']:[]),
    ...(citadel?[...citadel.replacedLandmarks,...UPPER_REPLACED_LANDMARKS]:[])]:[];
  const entrances=urban.flatMap(urbanEntrances);
  const accepted = createStreamingWorld();
  const areas: WorldArea[] = blueprint.districts.map(district => {
    const existing = accepted.areas.find(area => area.id === district.acceptedArea);
    const content=urban.find(u=>u.id===district.id);
    const xs = district.footprint.map(point => point.x), zs = district.footprint.map(point => point.z);
    return {
      id: district.id, bounds: existing?.bounds ?? { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
      course: existing?.course ?? (district.id==='citadel'&&citadel?citadel.course:content?urbanCourse(content,blueprint.seed):{ id: `m6.${district.id}`, seed: blueprint.seed, bounds: 850,
        spawn: { ...district.center, y: district.center.y + .04 }, boxes: blueprint.massing[district.id], surfaces: [], labels: [], bookmarks: {} }),
      assetIds: existing?.assetIds ?? (district.id==='citadel'&&citadel?['citadel.hero']:content?['district.kit']:[]), npcIds: existing?.npcIds ?? content?.npcs.definitions.map(n=>n.id) ?? [],
      ...(content?{urban:content}:{}),
      ...(district.id==='citadel'&&citadel?{citadel}:{}),
      ...(upper&&UPPER_CITY_COLD_SECONDS[district.id]!==undefined?{coldPreparationSeconds:UPPER_CITY_COLD_SECONDS[district.id]}:{}),
      ...(core?{preloadApproaches:blueprint.connections.filter(c=>c.from===district.id||c.to===district.id)
        .map(c=>({neighbor:c.from===district.id?c.to:c.from,points:c.from===district.id?c.points:[...c.points].reverse()}))}:{}),
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
    surfaces: [...accepted.residentCourse.surfaces!, ...blueprint.terrain,
      upper?cityUpperRetainingSurface(blueprint):cityRetainingSurface(blueprint.terrain,cityRoadSurfaces(blueprint.roads)),
      ...(upper?[cityUpperRoadCoping(blueprint)]:[]),
      ...cityRoadSurfaces(blueprint.roads)] };
  const bookmarks = { ...accepted.course.bookmarks };
  for(const area of areas)Object.assign(bookmarks,area.course.bookmarks);
  if(citadel)for(const [name,view] of Object.entries(citadel.course.bookmarks))bookmarks[`m9.citadel.${name}`]=view;
  for (const district of blueprint.districts) bookmarks[`city.${district.id}`] = {
    position: { ...district.center, y: district.center.y + .04 }, yaw: 0, pitch: .06,
  };
  const course: CourseSpec = { ...accepted.course, id: upper?'m9-upper-city':core?'m8-city-core':production?'m7-urban-districts':blueprint.id, bounds: 850,
    boxes: [...residentCourse.boxes, ...areas.flatMap(area => area.course.boxes)],
    surfaces: [...residentCourse.surfaces!, ...areas.flatMap(area => area.course.surfaces ?? [])],
    labels: [], bookmarks };
  if(production)blueprint.cameras.push(...urban.map(u=>({id:`${urbanNamespace(u.id)}-${u.id}`,...u.eagle})));
  if(core)blueprint.cameras.push({id:'city-core',position:{x:-160,y:410,z:200},target:{x:145,y:14,z:-190},fov:48});
  return { blueprint, areas, residentCourse, course, route: upper?upperCityRoute(blueprint,urban):core?cityCoreRoute(blueprint,urban):blueprint.route,urban,entrances,replacedLandmarks,
    coreIds:upper?[...UPPER_CITY_IDS]:core?[...CITY_CORE_IDS]:[],core,upper,citadel,
    acceptedCourses: accepted.areas.map(area => area.course) };
}

/** At a fork, demand follows a connected neighbor toward velocity lookahead.
 * Nearby unconnected polygons cannot consume the second preparation slot. */
export function cityDemand(areas: readonly WorldArea[], position: Vec3, velocity: Vec3,previousDemand?:readonly AreaId[],returnNeighbor?:AreaId): AreaId[] {
  const nearest = [...areas].sort((a, b) => areaDistance(a, position) - areaDistance(b, position) ||
    Math.hypot(position.x - a.course.spawn.x, position.z - a.course.spawn.z) -
    Math.hypot(position.x - b.course.spawn.x, position.z - b.course.spawn.z))[0]!;
  const lead=nearest.preloadApproaches?CITY_CORE_PREPARATION_LEAD_SECONDS:10;
  const projected = { x: position.x + velocity.x * lead, y: position.y, z: position.z + velocity.z * lead };
  // Long production lookahead can point across a local court toward a cheap
  // future proxy over 100 m away, repeatedly canceling the expensive return
  // ward. Its coarse context is already resident. Admit its detail lease on
  // an actual nearby approach, leaving cold production preparation intact.
  // Keep the accepted Workshop connector's original core prediction. Original
  // M6/M7 arbitration has no core approach metadata and is unchanged.
  const neighbors = areas.filter(area => nearest.neighbors?.includes(area.id)&&
    (!nearest.preloadApproaches||area.assetIds.length>0||CITY_CORE_IDS.includes(area.id)||
      areaDistance(area,position)<=CITY_CORE_PROXY_APPROACH_METERS));
  const speed=Math.hypot(velocity.x,velocity.z);
  const originId=returnNeighbor??(previousDemand?.[0]!==nearest.id?previousDemand?.[0]:undefined);
  const origin=neighbors.find(a=>a.id===originId);
  // Remember which ward was actually crossed, rather than treating a short
  // local excursion as a fresh departure. No extra lease or render state is
  // retained: the source remains the one speculative neighbor within 20 m.
  if(nearest.preloadApproaches&&origin?.urban?.handoffs?.some(h=>h.neighbor===nearest.id)&&areaDistance(origin,position)<=20&&
    !neighbors.some(a=>a!==origin&&areaDistance(a,position)<=2))return [nearest.id,origin.id];
  // A brief stop at a road join does not reverse the player's established
  // departure. Keep its speculative neighbor rather than restarting native
  // preparation because a distant local portal wins the stationary tie.
  if(nearest.preloadApproaches&&speed<.1&&previousDemand?.[0]===nearest.id&&neighbors.some(a=>a.id===previousDemand[1]))
    return [nearest.id,previousDemand[1]!];
  const departure=(area:WorldArea)=>nearest.preloadApproaches?.filter(a=>a.neighbor===area.id&&a.points.length>1)
    .sort((a,b)=>Math.hypot(position.x-a.points[0]!.x,position.z-a.points[0]!.z)-Math.hypot(position.x-b.points[0]!.x,position.z-b.points[0]!.z))[0];
  const established=neighbors.find(a=>a.id===previousDemand?.[1]);
  const establishedDeparture=established&&departure(established);
  const directionAlignment=(area:WorldArea)=>{
    const approach=departure(area);if(!approach||speed<.1)return 0;
    const dx=approach.points[1]!.x-approach.points[0]!.x,dz=approach.points[1]!.z-approach.points[0]!.z;
    return (dx*velocity.x+dz*velocity.z)/(Math.hypot(dx,dz)*speed||1);
  };
  const decisiveAlternative=!!established&&speed>1&&directionAlignment(established)<-.85&&
    neighbors.some(a=>a!==established&&directionAlignment(a)>.85);
  // A short out-and-back inside an authored local support join still needs
  // its prepared return ward. A distant macro fork must not evict that lease.
  if(nearest.preloadApproaches&&previousDemand?.[0]===nearest.id&&established&&
    !neighbors.some(a=>a!==established&&areaDistance(a,position)<=2)&&
    nearest.urban?.handoffs?.some(h=>h.neighbor===established.id&&Math.hypot(position.x-h.position.x,position.z-h.position.z)<=Math.max(38,h.approachRadius)))
    return [nearest.id,established.id];
  // Braking/axis-wise acceleration and short readbacks can reverse the velocity
  // during a turn. Keep an established departure through the twelve-meter junction
  // envelope, then let decisive movement choose the next road normally.
  if(nearest.preloadApproaches&&!decisiveAlternative&&previousDemand?.[0]===nearest.id&&established&&establishedDeparture&&
    !neighbors.some(a=>areaDistance(a,position)<=2)&&
    Math.hypot(position.x-establishedDeparture.points[0]!.x,position.z-establishedDeparture.points[0]!.z)<=12&&
    neighbors.some(a=>a!==established&&departure(a)&&Math.hypot(departure(a)!.points[0]!.x-establishedDeparture.points[0]!.x,
      departure(a)!.points[0]!.z-establishedDeparture.points[0]!.z)<2))return [nearest.id,established.id];
  // M9's measured Garden return canceled a cold Gate while braking at a bend
  // of its actual connector. Keep that departure along the supported road,
  // including low-speed turns; reversing or approaching another polygon wins.
  // This is a demand latch, not an extra residency lease or readiness wait.
  if(nearest.coldPreparationSeconds!==undefined&&previousDemand?.[0]===nearest.id&&established&&establishedDeparture&&
    !neighbors.some(a=>a!==established&&areaDistance(a,position)<=2)){
    for(let i=1;i<establishedDeparture.points.length;i++){
      const a=establishedDeparture.points[i-1]!,b=establishedDeparture.points[i]!;
      const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(!length)continue;
      const t=((position.x-a.x)*dx+(position.z-a.z)*dz)/(length*length);
      if(t<0||t>1)continue;
      const distance=Math.hypot(position.x-a.x-dx*t,position.z-a.z-dz*t);
      const alignment=speed<.1?1:(velocity.x*dx+velocity.z*dz)/(speed*length);
      if(distance<=3&&alignment>=-.1)return [nearest.id,established.id];
    }
  }
  // Keep the outgoing neighbor until the whole capsule has cleared its portal.
  // Otherwise a new reverse guard can appear ahead of a just-crossed player.
  neighbors.sort((a, b) => {
    // A production service route can turn back through a nearby local portal.
    // Retain that connected ward across its authored approach instead of evicting
    // it for an unrelated velocity projection just before entering its support.
    const nearA=areaDistance(a,position)<=2,nearB=areaDistance(b,position)<=2;
    const close=(area:WorldArea)=>{
      if(areaDistance(area,position)<=2)return true;
      const joins=[...(area.urban?.handoffs?.filter(h=>h.neighbor===nearest.id)??[]),
        ...(nearest.preloadApproaches?nearest.urban?.handoffs?.filter(h=>h.neighbor===area.id)??[]:[])];
      return joins.some(h=>{
      const dx=h.position.x-position.x,dz=h.position.z-position.z,distance=Math.hypot(dx,dz);
      // A loaded local quay still owns approaches and tangential turns. Once
      // moving away from that join, release its preference for the next fork.
      const retained=!!nearest.preloadApproaches&&previousDemand?.[0]===nearest.id&&previousDemand?.[1]===area.id&&distance<=Math.max(38,h.approachRadius);
      const approaching=!nearest.preloadApproaches||speed<.1||(velocity.x*dx+velocity.z*dz)/Math.max(.01,distance)>=-.1;
      return retained||distance<=h.approachRadius&&approaching;
      });
    };
    const closeA=close(a),closeB=close(b);
    const approachA=departure(a),approachB=departure(b);
    let forkOrder=0,authoredDeparture=false;
    if(speed>.1&&approachA&&approachB){
      const pivotA=approachA.points[0]!,pivotB=approachB.points[0]!;
      const dx=pivotA.x-position.x,dz=pivotA.z-position.z,distance=Math.hypot(dx,dz);
      const approachingPivot=distance<=2||(velocity.x*dx+velocity.z*dz)/(distance*speed)>=.5;
      if(approachingPivot&&Math.hypot(pivotA.x-pivotB.x,pivotA.z-pivotB.z)<2&&distance<=speed*lead+36){
        const alignment=(points:readonly Vec3[])=>{const dx=points[1]!.x-points[0]!.x,dz=points[1]!.z-points[0]!.z;
          return (dx*velocity.x+dz*velocity.z)/(Math.hypot(dx,dz)*speed||1);};
        // Straight projection can land in an unrelated polygon across a bend.
        // Use the real outgoing road directions at the shared junction.
        const alignmentA=alignment(approachA.points),alignmentB=alignment(approachB.points);
        // Before an ambiguous fork, an asset-backed ward needs the lead time;
        // a resident-only proxy can prepare after the turn becomes decisive.
        // Do not speculate across a branch pointing away from current motion.
        const expensiveA=Number(a.assetIds.length>0),expensiveB=Number(b.assetIds.length>0);
        const establishedA=previousDemand?.[0]===nearest.id&&previousDemand?.[1]===a.id;
        const establishedB=previousDemand?.[0]===nearest.id&&previousDemand?.[1]===b.id;
        // From rest, separate X/Z acceleration briefly produces a 45-degree
        // velocity at the preceding waypoint, before the shared pivot itself.
        const plausibleA=alignmentA>=(establishedA&&expensiveA ? .25 : .5);
        const plausibleB=alignmentB>=(establishedB&&expensiveB ? .25 : .5);
        // Approaching a shared junction from a local lane does not disclose the
        // eventual turn. Prepare the branch with the shorter remaining lead;
        // a farther branch still has time after the departure becomes decisive.
        const urgencyA=expensiveA*(a.coldPreparationSeconds??CITY_CORE_COLD_SECONDS[a.id]??lead)-areaDistance(a,pivotA)/5.4;
        const urgencyB=expensiveB*(b.coldPreparationSeconds??CITY_CORE_COLD_SECONDS[b.id]??lead)-areaDistance(b,pivotB)/5.4;
        // An incoming bridge can face partly away from the eventual street at
        // a bend. M9's measured costly branch needs preparation before the turn;
        // decisive departure still wins inside the twelve-metre junction.
        const minimumAlignment=(area:WorldArea,established:boolean)=>established||area.coldPreparationSeconds!==undefined?-.65:-.2;
        const urgent=distance>12&&alignmentA>=minimumAlignment(a,establishedA)&&alignmentB>=minimumAlignment(b,establishedB)&&Math.abs(urgencyA-urgencyB)>=.5;
        forkOrder=urgent?urgencyB-urgencyA:plausibleA&&plausibleB&&expensiveA!==expensiveB
          ? expensiveB-expensiveA : alignmentB-alignmentA;
        authoredDeparture=urgent||distance<=6||Math.abs(alignmentA-alignmentB)>=.35||plausibleA&&plausibleB&&expensiveA!==expensiveB;
      }
    }
    // Axis-wise controller acceleration briefly points between branches. At
    // the shared junction, its authored departure wins over a remote portal's
    // approach circle. Immediate destination/capsule proximity still wins.
    return (authoredDeparture?(Number(nearB)-Number(nearA)||forkOrder):0) ||
    Number(closeB)-Number(closeA) || forkOrder || areaDistance(a, projected) - areaDistance(b, projected) ||
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
export function citySafetyGates(blueprint: CityBlueprint, activeIds: readonly string[], position: Vec3,urban:readonly UrbanDistrict[]=[],core=false): BoxSpec[] {
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
    // An active endpoint remains the source until the opposite collision is
    // installed. The connector midpoint can precede the destination footprint;
    // switching there would remove its guard before an unready crossing.
    const fromActive=activeIds.includes(connection.from),toActive=activeIds.includes(connection.to);
    const destination = fromActive&&!toActive?connection.to:toActive&&!fromActive?connection.from:
      onFromSide ? connection.to : connection.from;
    if (activeIds.includes(destination)) return [];
    const key=`${connection.id}.${destination}`;
    const existing=portals!.get(key);if(existing)return [existing];
    // A guard in the middle of a long bridge could lie outside the 44m
    // activation band and deadlock a ready destination. Place it just before
    // the destination footprint, reached from either end of the connector.
    const district = blueprint.districts.find(item=>item.id===destination)!;
    const distanceArea = { id: district.id, bounds: {minX:0,maxX:0,minZ:0,maxZ:0}, footprint: district.footprint,
      course: {} as CourseSpec, assetIds: [], npcIds: [] };
    const directed = destination===connection.to ? points : [...points].reverse();
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
    // M7's local support portal can be inside the neighboring macro footprint.
    // M8 must guard that earlier boundary as well as the authored support join.
    // Align with the footprint edge so the complete corridor width is covered.
    const district=blueprint.districts.find(item=>item.id===destination)!;
    const area={id:district.id,bounds:{minX:0,maxX:0,minZ:0,maxZ:0},footprint:district.footprint,
      course:{} as CourseSpec,assetIds:[],npcIds:[]};
    if(core&&areaDistance(area,h.position)===0){
      const key=`local.${d.id}.${h.id}.${destination}.core`;
      const existing=portals!.get(key);if(existing)return [existing];
      let closest={x:h.position.x,z:h.position.z,nx:0,nz:0,distance:Infinity};
      for(let i=0;i<district.footprint.length;i++){
        const a=district.footprint[i]!,b=district.footprint[(i+1)%district.footprint.length]!;
        const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(!length)continue;
        const t=Math.max(0,Math.min(1,((h.position.x-a.x)*dx+(h.position.z-a.z)*dz)/(length*length)));
        const x=a.x+dx*t,z=a.z+dz*t,distance=Math.hypot(h.position.x-x,h.position.z-z);
        if(distance>=closest.distance)continue;
        let nx=dz/length,nz=-dx/length;
        const direction=destination===h.neighbor?1:-1;
        if((nx*h.inward.x+nz*h.inward.z)*direction<0){nx=-nx;nz=-nz;}
        closest={x,z,nx,nz,distance};
      }
      const guard:BoxSpec={id:`m7.guard.${d.id}.${h.id}.${destination}`,position:{x:closest.x+closest.nx*.45,y:h.position.y+2.5,z:closest.z+closest.nz*.45},
        size:{x:h.width+1,y:5,z:.3},rotationY:Math.atan2(closest.nx,closest.nz),color:0,collides:true,visible:false};
      portals!.set(key,guard);return [guard];
    }
    return [{id:`m7.guard.${d.id}.${h.id}.${destination}`,position:{...h.position,y:h.position.y+2.5},
      size:{x:h.width+1,y:5,z:.3},rotationY:Math.atan2(h.inward.x,h.inward.z),color:0,collides:true,visible:false}];
  })??[]);
  return [...macro,...local];
}
