import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, DoubleSide, Float32BufferAttribute,
  Group, InstancedMesh, LineBasicMaterial, LineSegments, Material, Mesh,
  MeshStandardMaterial, Object3D, Sprite, SpriteMaterial, SRGBColorSpace, Texture,
} from 'three';
import type { CityBlueprint, CityRoad } from '../simulation/city-contracts';
import { cityRetainingSurface, cityUpperRetainingSurface, cityUpperRoadCoping } from '../simulation/city-terrain';
import { cityRoadSurfaces } from '../simulation/city-blueprint';
import type { BoxSpec, CourseSpec, GameState, Vec3 } from '../simulation/types';
import type { UrbanDistrict } from '../simulation/urban-contracts';
import type { CitadelSpec } from '../simulation/citadel-contracts';
import { CITADEL_LAMPS } from '../simulation/citadel';
import { PointLight } from 'three';

export type CityDebugLayer = 'none' | 'districts' | 'roads' | 'waterways' | 'bridges' | 'elevation' | 'streaming';
type Surface = NonNullable<CourseSpec['surfaces']>[number];
type Disposable = { dispose(): void };
interface GeometryData { vertices: number[]; indices: number[]; colors: number[] }

/** Geometry inventory is CPU-authored proxy data, not a production city benchmark. */
export interface CityPresentationStats {
  kind: 'city-blueprint-proxies'; districts: number; terrainSurfaces: number;
  roads: number; waterways: number; bridges: number; landmarkInstances: number;
  bridgeSpans: number; stairTreads: number; landmarkCapInstances: number;
  massingInstances: number; acceptedProxyInstances: number;
  overviewVisible: boolean; overviewDistricts: string[]; debugLayer: CityDebugLayer;
  visibleDrawObjects: number; visibleTriangles: number;
  resources: { geometries: number; materials: number; textures: number; instanceBuffers: number };
  disposed: boolean; releasedResources: number;
}

const data = (): GeometryData => ({ vertices: [], indices: [], colors: [] });
function append(target: GeometryData, surface: Surface, color = surface.color, lift = 0) {
  const offset = target.vertices.length / 3, tint = new Color(color);
  for (let i = 0; i < surface.vertices.length; i += 3) {
    target.vertices.push(surface.vertices[i]!, surface.vertices[i + 1]! + lift, surface.vertices[i + 2]!);
    target.colors.push(tint.r, tint.g, tint.b);
  }
  target.indices.push(...surface.indices.map(index => offset + index));
}
function geometry(source: GeometryData) {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(source.vertices, 3));
  result.setAttribute('color', new Float32BufferAttribute(source.colors, 3));
  result.setIndex(source.indices); result.computeVertexNormals();
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

/** Coherent strip joins use a capped miter, rather than disconnected per-segment planes. */
function ribbon(id: string, points: readonly Vec3[], width: number, color: number, lift = 0): Surface {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, a = points[Math.max(0, i - 1)]!, b = points[Math.min(points.length - 1, i + 1)]!;
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length, nz = dx / length;
    const previousLength = Math.hypot(p.x - a.x, p.z - a.z) || length;
    const previousNX = i ? -(p.z - a.z) / previousLength : nx;
    const previousNZ = i ? (p.x - a.x) / previousLength : nz;
    const miter = Math.min(width * .85, width * .5 / Math.max(.6, nx * previousNX + nz * previousNZ));
    vertices.push(p.x + nx * miter, p.y + lift, p.z + nz * miter,
      p.x - nx * miter, p.y + lift, p.z - nz * miter);
    if (i) { const k = i * 2; indices.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  // Positive Y winding is required even on a route whose direction reverses.
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const normalY = (vertices[b + 2]! - vertices[a + 2]!) * (vertices[c]! - vertices[a]!) -
      (vertices[b]! - vertices[a]!) * (vertices[c + 2]! - vertices[a + 2]!);
    if (normalY < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  }
  return { id, vertices, indices, color };
}

/** Match the terrain's strip-and-node water cutouts. These submerged decorative
 * banks close bend/landing gaps; the channel width and water surface stay fixed. */
function bankBed(id: string, points: readonly Vec3[], width: number): Surface {
  const result:Surface={id,vertices:[],indices:[],color:0x998f6c};
  const quad=(corners:Vec3[])=>{const k=result.vertices.length/3;result.vertices.push(...corners.flatMap(p=>[p.x,p.y+.015,p.z]));
    result.indices.push(k,k+2,k+1,k,k+3,k+2);};
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length*width/2,nz=dx/length*width/2;
    quad([{...a,x:a.x+nx,z:a.z+nz},{...a,x:a.x-nx,z:a.z-nz},{...b,x:b.x-nx,z:b.z-nz},{...b,x:b.x+nx,z:b.z+nz}]);
  }
  for(const p of points){const h=width/2;quad([{...p,x:p.x-h,z:p.z-h},{...p,x:p.x+h,z:p.z-h},
    {...p,x:p.x+h,z:p.z+h},{...p,x:p.x-h,z:p.z+h}]);}
  return result;
}

const roadColor = (road: CityRoad) => road.kind === 'bridge' ? 0xd2bb94 : road.kind === 'stairs' ? 0xe3cfaa
  : road.kind === 'alley' ? 0xb5a07d : road.kind === 'secondary' ? 0xc9b794 : 0xe4d2ae;
const districtColors = [0xf3c15d, 0x69d4c8, 0xc09be6, 0x83ba66, 0xe79567, 0x6da7e0, 0xd3d479];

export { cityBridgeSpans } from '../simulation/city-navigation';
import { cityBridgeSpans } from '../simulation/city-navigation';

function hipGeometry() {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute([
    -.5, -.5, -.5, .5, -.5, -.5, .5, -.5, .5, -.5, -.5, .5, -.28, .5, 0, .28, .5, 0,
  ], 3));
  result.setIndex([0, 4, 5, 0, 5, 1, 2, 5, 4, 2, 4, 3, 0, 3, 4, 1, 5, 2, 0, 1, 2, 0, 2, 3]);
  result.computeVertexNormals(); return result;
}

/** Resident terrain/landmarks and overview-only density proxies. The caller guards debug access. */
export function createCityPresentation(sourceBlueprint: CityBlueprint, acceptedCourses: CourseSpec[],replacedLandmarks:readonly string[]=[],urban:readonly UrbanDistrict[]=[],citadel?:CitadelSpec|null) {
  const blueprint=replacedLandmarks.length?{...sourceBlueprint,landmarks:sourceBlueprint.landmarks.filter(l=>!replacedLandmarks.includes(l.id))}:sourceBlueprint;
  const group = new Group(); group.name = 'city.blueprint.resident';
  // Fixed shader light count; only intensity changes with authoritative time/residency.
  const heroLights=citadel?CITADEL_LAMPS.map(([x,y,z],index)=>{
    const light=new PointLight(0xffbf70,0,13,2);light.position.set(x,y,z);light.name=`city.citadel.lamp.${index}`;light.castShadow=false;group.add(light);return light;
  }):[];
  const overview = new Group(); overview.name = 'city.blueprint.overview-only'; overview.visible = false; group.add(overview);
  const debug = new Group(); debug.name = 'city.blueprint.debug'; group.add(debug);
  const resources = new Set<Disposable>();
  const own = <T extends Disposable>(value: T): T => { resources.add(value); return value; };
  const standard = own(new MeshStandardMaterial({ vertexColors: true, roughness: .95, side: DoubleSide }));
  const sides = own(new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide, flatShading: true }));
  const boxMaterial = own(new MeshStandardMaterial({ roughness: .92, flatShading: true }));
  const cube = own(new BoxGeometry(1, 1, 1));
  const debugGroups = new Map<CityDebugLayer, Group>();
  for (const layer of ['districts', 'roads', 'waterways', 'bridges', 'elevation', 'streaming'] as const) {
    const target = new Group(); target.name = `city.debug.${layer}`; target.visible = false; debug.add(target); debugGroups.set(layer, target);
  }
  const districtOverview = new Map<string, Group>();
  let released = false, releasedResources = 0, layer: CityDebugLayer = 'none', labelsCreated = false;
  let massingInstances = 0, acceptedProxyInstances = 0;
  function addSurface(name: string, source: GeometryData, target = group, material = standard) {
    if (!source.indices.length) return;
    const mesh = new Mesh(own(geometry(source)), material); mesh.name = name; mesh.receiveShadow = true;
    target.add(mesh); return mesh;
  }
  function boxes(name: string, specs: readonly BoxSpec[], target = group, shape: BufferGeometry = cube) {
    if (!specs.length) return;
    const mesh = own(new InstancedMesh(shape, boxMaterial, specs.length)); mesh.name = name;
    const transform = new Object3D();
    specs.forEach((spec, i) => {
      transform.position.set(spec.position.x, spec.position.y, spec.position.z);
      transform.scale.set(spec.size.x, spec.size.y, spec.size.z);
      transform.rotation.set(spec.rotationX ?? 0, spec.rotationY ?? 0, spec.rotationZ ?? 0); transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, new Color(spec.color));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.proxyIds = specs.map(spec => spec.id); target.add(mesh); return mesh;
  }
  const top = data(); blueprint.terrain.forEach(surface => append(top, surface));
  addSurface('city.terrain.tops', top);
  const retaining=data();append(retaining,citadel?cityUpperRetainingSurface(blueprint):
    cityRetainingSurface(blueprint.terrain,cityRoadSurfaces(blueprint.roads)));
  addSurface('city.terrain.retaining-sides', retaining, group, sides);
  const water = data(), banks = data();
  blueprint.waterways.forEach(channel => {
    append(banks, citadel?bankBed(`${channel.id}.banks`,channel.points,channel.width+2.2):
      ribbon(`${channel.id}.banks`, channel.points, channel.width + 2.2, 0x998f6c, .015));
    append(water, ribbon(channel.id, channel.points, channel.width, 0x278f95, .045));
  });
  addSurface('city.water.bank-ribbons', banks); addSurface('city.water.connected-ribbons', water);
  // Like the streamed paving veneer, the coping finish sits just above its
  // physical support. Its top is 5 mm below the paving, closing grazing views
  // through the clearance cut without changing the approved road grade.
  if(citadel){const coping=data();append(coping,cityUpperRoadCoping(blueprint),undefined,.07);addSurface('city.circulation.edge-coping',coping);}
  const roads = data();
  blueprint.roads.forEach(road => cityRoadSurfaces([road]).forEach(surface => append(roads, surface, roadColor(road), .025)));
  addSurface('city.circulation.roads-stairs-ramps', roads);

  const bridgeStructure: BoxSpec[] = [], bridgeSpans = cityBridgeSpans(blueprint);
  for (const [spanIndex, bridge] of bridgeSpans.entries()) {
    const { a, b } = bridge, i = `${bridge.segment}.${spanIndex}`, length = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const pitch = -Math.atan2(b.y - a.y, length), inclineLength = Math.hypot(length, b.y - a.y);
    bridgeStructure.push({ id: `${bridge.roadId}.deck.${i}`, position: { ...center, y: center.y - .3 },
      size: { x: bridge.width, y: .55, z: inclineLength }, rotationX: pitch, rotationY: yaw, color: 0x9d9278, collides: false });
    for (const side of [-1, 1]) bridgeStructure.push({ id: `${bridge.roadId}.parapet.${i}.${side}`,
      position: { x: center.x + Math.cos(yaw) * side * (bridge.width / 2 - .12), y: center.y + .55,
        z: center.z - Math.sin(yaw) * side * (bridge.width / 2 - .12) },
      size: { x: .24, y: 1.1, z: inclineLength }, rotationX: pitch, rotationY: yaw, color: 0xb5aa8e, collides: false });
    for (const fraction of [.18, .82]) {
      const y = a.y + (b.y - a.y) * fraction;
      const bottom = bridge.waterLevel - 1.5;
      bridgeStructure.push({ id: `${bridge.roadId}.pier.${i}.${fraction}`, position: {
        x: a.x + (b.x - a.x) * fraction, y: (y + bottom) / 2, z: a.z + (b.z - a.z) * fraction },
        size: { x: bridge.width * .75, y: Math.max(.5, y - bottom), z: 1.7 }, rotationY: yaw, color: 0x8d8873, collides: false });
    }
  }
  boxes('city.bridge.deck-parapets-piers', bridgeStructure);
  const stairTreads: BoxSpec[] = [];
  for (const stair of blueprint.roads.filter(road => road.kind === 'stairs')) for (let i = 1; i < stair.points.length; i++) {
    const a = stair.points[i - 1]!, b = stair.points[i]!, rise = b.y - a.y;
    if (Math.abs(rise) < .05) continue;
    const count = Math.ceil((Math.abs(rise) - 1e-8) / .17), run = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let step = 0; step < count; step++) {
      const t = (step + .5) / count;
      stairTreads.push({ id: `${stair.id}.tread.${i}.${step}`, position: {
        x: a.x + (b.x - a.x) * t, y: a.y + rise * t + .05, z: a.z + (b.z - a.z) * t },
        size: { x: stair.width, y: .12, z: run / count }, rotationY: yaw, color: step % 3 ? 0xc9bca0 : 0xe0cfaa, collides: false });
    }
  }
  boxes('city.circulation.stair-treads', stairTreads);
  boxes('city.landmark.masses', blueprint.landmarks);
  const hipRoofs: BoxSpec[] = [], towerCaps: BoxSpec[] = [], finials: BoxSpec[] = [];
  for (const landmark of blueprint.landmarks) {
    if(/wall|buttress|pier/.test(landmark.id))continue;
    const top = landmark.position.y + landmark.size.y / 2, tower = /tower|belfry/.test(landmark.id);
    const height = tower ? Math.min(12, landmark.size.y * .3) : Math.min(7, landmark.size.z * .18);
    const teal = /citadel-tower|temple/.test(landmark.id), color = teal ? 0x427e79 : 0xa85d3e;
    const roof = { id: `${landmark.id}.silhouette-cap`, position: { ...landmark.position, y: top + height / 2 - .08 },
      size: { x: landmark.size.x + 1.2, y: height, z: landmark.size.z + 1.2 }, rotationY: landmark.rotationY ?? 0, color, collides: false };
    if (tower) {
      roof.size.x /= 2; roof.size.z /= 2; towerCaps.push(roof);
      finials.push({ id: `${landmark.id}.finial`, position: { ...landmark.position, y: top + height + 1.2 },
        size: { x: .3, y: 2.5, z: .3 }, color: 0xbaa675, collides: false });
    } else hipRoofs.push(roof);
  }
  if (hipRoofs.length) boxes('city.landmark.hipped-roof-silhouettes', hipRoofs, group, own(hipGeometry()));
  if (towerCaps.length) boxes('city.landmark.octagonal-cap-silhouettes', towerCaps, group, own(new ConeGeometry(1, 1, 8, 1)));
  boxes('city.landmark.finials', finials);
  // Closed, dimensioned doorway marks orient walkers. They are geometric blocks on real sides.
  const doors: BoxSpec[] = [];
  for (const landmark of blueprint.landmarks.filter(box => box.collides && box.size.y >= 7 && box.size.x >= 6 && box.size.z >= 6)) {
    const yaw = landmark.rotationY ?? 0, half = landmark.size.z / 2;
    for (const side of [-1, 1]) doors.push({ id: `${landmark.id}.closed-door.${side}`, position: {
      x: landmark.position.x + Math.sin(yaw) * side * (half + .045),
      y: landmark.position.y - landmark.size.y / 2 + 1.1,
      z: landmark.position.z + Math.cos(yaw) * side * (half + .045) },
      size: { x: 1.1, y: 2.2, z: .09 }, rotationY: yaw, color: 0x514437, collides: false });
  }
  boxes('city.landmark.closed-entrance-marks', doors);

  for (const district of blueprint.districts) {
    const target = new Group(); target.name = `city.overview.${district.id}`; overview.add(target); districtOverview.set(district.id, target);
    const production=urban.find(u=>u.id===district.id);
    if(district.id==='citadel'&&citadel){
      const roofs=citadel.silhouettes.filter(b=>/roof|cap/.test(b.id)),bodies=citadel.silhouettes.filter(b=>!/roof|cap/.test(b.id));
      boxes('city.overview.citadel.architecture',bodies,target);
      boxes('city.overview.citadel.roofs',roofs,target,own(hipGeometry()));
      massingInstances+=citadel.silhouettes.length;continue;
    }
    const masses = production?production.buildings.map(b=>({id:`${b.id}.overview-body`,position:{...b.position,y:b.position.y+b.floors*b.floorHeight/2},
      size:{x:b.width,y:b.floors*b.floorHeight,z:b.depth},rotationY:b.yaw,color:b.plaster,collides:false})):blueprint.massing[district.id] ?? [];
    boxes(`city.overview.massing.${district.id}`, masses, target); massingInstances += masses.length;
    if(production){
      const roofs=production.buildings.map(b=>({id:`${b.id}.overview-roof`,position:{...b.position,y:b.position.y+b.floors*b.floorHeight+b.roofHeight/2},
        size:{x:(b.roofDirection?b.depth:b.width)+.7,y:b.roofHeight,z:(b.roofDirection?b.width:b.depth)+.7},rotationY:b.yaw+b.roofDirection*Math.PI/2,color:b.roofColor,collides:false}));
      boxes(`city.overview.production-roofs.${district.id}`,roofs,target,own(hipGeometry()));
    }
  }
  acceptedCourses.forEach((course, index) => {
    const id = course.id.includes('rural') ? 'rural' : course.id.includes('neighbor') ? 'neighbor-shell'
      : course.id.includes('market') ? 'river-market' : (['rural', 'river-market', 'neighbor-shell'] as const)[index];
    const target = id ? districtOverview.get(id) : undefined;
    if (!target) return;
    const source = data(); (course.surfaces ?? []).forEach(surface => append(source, surface));
    addSurface(`city.overview.accepted-terrain.${id}`, source, target);
    const proxies = course.boxes.filter(box => box.collides && box.size.y >= .9 && Math.max(box.size.x, box.size.z) <= 32);
    boxes(`city.overview.accepted-collider-masses.${id}`, proxies, target); acceptedProxyInstances += proxies.length;
  });

  function lines(name: string, segments: readonly [Vec3, Vec3][], color: number, target: Group) {
    if (!segments.length) return;
    const vertices = segments.flatMap(([a, b]) => [a.x, a.y, a.z, b.x, b.y, b.z]);
    const buffer = own(new BufferGeometry()); buffer.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    const material = own(new LineBasicMaterial({ color, depthTest: false, toneMapped: false }));
    const mesh = new LineSegments(buffer, material); mesh.name = name; mesh.renderOrder = 30; target.add(mesh);
  }
  const edges = (points: readonly Vec3[]): [Vec3, Vec3][] => points.slice(1).map((p, i) => [points[i]!, p]);
  blueprint.districts.forEach((district, i) => {
    const color = districtColors[i % districtColors.length]!;
    const border = district.footprint.map(p => ({ x: p.x, y: district.center.y + .4, z: p.z }));
    if (border.length) border.push(border[0]!);
    lines(`city.debug.border.${district.id}`, edges(border), color, debugGroups.get('districts')!);
  });
  const elevation = data();
  for (const surface of blueprint.terrain) {
    const y = surface.vertices.filter((_, i) => i % 3 === 1).reduce((sum, value) => sum + value, 0) / (surface.vertices.length / 3);
    const color = new Color().setHSL(.38 - Math.min(1, Math.max(0, y) / 50) * .34, .56, .56);
    append(elevation, surface, color.getHex(), .06);
  }
  addSurface('city.debug.elevation.bands', elevation, debugGroups.get('elevation')!);
  for (const [name, collection, color] of [
    ['roads', blueprint.roads, 0xffd477], ['waterways', blueprint.waterways, 0x65f4ee],
    ['bridges', blueprint.roads.filter(road => road.kind === 'bridge'), 0xff90d7],
  ] as const) lines(`city.debug.${name}.network`, collection.flatMap(item => edges(item.points.map(p => ({ ...p, y: p.y + .3 })))), color, debugGroups.get(name)!);
  const centerById = new Map(blueprint.districts.map(district => [district.id, district.center]));
  const links: [Vec3, Vec3][] = [];
  for (const district of blueprint.districts) for (const neighbor of district.neighbors) if (district.id < neighbor) {
    const center = centerById.get(neighbor);
    if (center) links.push([{ ...district.center, y: district.center.y + 5 }, { ...center, y: center.y + 5 }]);
  }
  lines('city.debug.streaming.adjacency', links, 0xf9aeff, debugGroups.get('streaming')!);

  function createLabels() {
    if (labelsCreated || typeof document === 'undefined') return;
    labelsCreated = true;
    for (const district of blueprint.districts) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80;
      const context = canvas.getContext('2d'); if (!context) continue;
      context.fillStyle = 'rgba(20, 31, 27, .84)'; context.fillRect(0, 0, 512, 80);
      context.font = 'bold 54px system-ui'; context.fillStyle = '#fff6db'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(district.id, 256, 40, 486);
      const texture = own(new CanvasTexture(canvas)); texture.colorSpace = SRGBColorSpace;
      const material = own(new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      const sprite = new Sprite(material); sprite.name = `city.debug.id.${district.id}`;
      sprite.position.set(district.center.x, district.center.y + 9, district.center.z);
      sprite.scale.set(70, 10.94, 1); sprite.renderOrder = 50; debugGroups.get('districts')!.add(sprite);
    }
  }
  return {
    group,
    setCitadelSkyline(root:import('three').Object3D) {
      const target=districtOverview.get('citadel');if(!citadel||!target)throw new Error('Citadel skyline requires M9 resident context.');
      target.clear();target.add(root);
    },
    update(state: GameState, activeIds: readonly string[]) {
      if (released) return;
      const artView=state.camera.mode === 'eagle-eye' || state.camera.mode === 'free';
      const warmth=state.environment?Math.max(0,Math.min(1,(1.85-state.environment.lighting.fillIntensity)/.67)):0;
      heroLights.forEach(light=>{light.intensity=activeIds.includes('citadel')?warmth*9:0;});
      overview.visible = artView || urban.length>0;
      for (const [id, target] of districtOverview) target.visible = !activeIds.includes(id) && (artView||urban.some(d=>d.id===id));
    },
    setDebug(next: CityDebugLayer) {
      if (released) return;
      layer = next; if (next === 'districts') createLabels();
      for (const [name, target] of debugGroups) target.visible = next === name;
    },
    stats(): CityPresentationStats {
      let visibleDrawObjects = 0, visibleTriangles = 0;
      group.traverseVisible(object => {
        if (!(object instanceof Mesh || object instanceof LineSegments || object instanceof Sprite)) return;
        visibleDrawObjects++;
        if (object instanceof Mesh) visibleTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position')?.count ?? 0) / 3
          * (object instanceof InstancedMesh ? object.count : 1);
      });
      const all = [...resources];
      return { kind: 'city-blueprint-proxies', districts: blueprint.districts.length, terrainSurfaces: blueprint.terrain.length,
        roads: blueprint.roads.length, waterways: blueprint.waterways.length, bridges: blueprint.roads.filter(road => road.kind === 'bridge').length,
        landmarkInstances: blueprint.landmarks.length, massingInstances, acceptedProxyInstances,
        bridgeSpans: bridgeSpans.length, stairTreads: stairTreads.length, landmarkCapInstances: hipRoofs.length + towerCaps.length,
        overviewVisible: overview.visible && !released, overviewDistricts: overview.visible && !released ? [...districtOverview].filter(([, target]) => target.visible).map(([id]) => id) : [],
        debugLayer: layer, visibleDrawObjects, visibleTriangles,
        resources: { geometries: all.filter(r => r instanceof BufferGeometry).length, materials: all.filter(r => r instanceof Material).length,
          textures: all.filter(r => r instanceof Texture).length, instanceBuffers: all.filter(r => r instanceof InstancedMesh).length },
        disposed: released, releasedResources };
    },
    dispose() {
      if (released) return; released = true;
      group.removeFromParent(); group.clear();
      const failures: unknown[] = [];
      for (const resource of resources) {
        try { resource.dispose(); releasedResources++; } catch (error) { failures.push(error); }
      }
      resources.clear(); districtOverview.clear(); debugGroups.clear();
      if (failures.length) throw new AggregateError(failures, 'City blueprint resource disposal failed.');
    },
  };
}
