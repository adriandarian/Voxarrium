import { finishPreparation } from './preparation-scheduler';
import type { PreparationScheduler } from './preparation-scheduler';
import { preparationResources } from './preparation-cache';
import type { PreparationResources } from './preparation-cache';
import {
  Box3, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh,
  Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Vector3,
} from 'three';
import type { Material } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { materialColor, normalWorld, positionWorld, texture, vec2 } from 'three/tsl';
import { loadDistrictKit, inspectDistrictKit } from '../assets/district';
import type { DistrictModuleId } from '../assets/district';
import { DISTRICT, DISTRICT_BUILDINGS, DISTRICT_GARDENS, DISTRICT_STREETS } from '../simulation/district-layout';
import type { DistrictBuilding } from '../simulation/district-layout';
import { DISTRICT_DRESSING, DISTRICT_FACADES, DISTRICT_LAMPS, DISTRICT_STALLS, FACADE_PROFILES } from '../simulation/district-art';
import type { EnvironmentState } from '../simulation/environment';
import type { CourseSpec } from '../simulation/types';
import { landscapeMaterialJobs } from './landscape-materials';
import { ecologyRegistrationJobs } from './rural-ecology';
import { randomSequence } from './rural-geometry';
import { districtGroundJobs } from './district-ground';
import type { UrbanBuilding, UrbanDistrict } from '../simulation/urban-contracts';

type Placement = { matrix: Matrix4; plaster: number; clay: number; cloth: number; tint: number; owner: string };
type Envelope = { min: [number, number, number]; max: [number, number, number] };
type Opening = { x: number; y: number; width: number; height: number; module: 'door' | 'window' | 'shop-window'; shutter?: number };

/** All four elevations partition around actual voids; no repeated per-panel Object3Ds. */
export function composeDistrictArchitecture(root: Object3D) { return finishPreparation(districtArchitectureJobs(root)); }
export function* districtArchitectureJobs(root: Object3D, scope?: PreparationResources, target?: Group, urban?: UrbanDistrict) {
  const ownership = preparationResources(scope);
  const group = target ?? new Group(); group.name = urban ? `urban.${urban.id}.architecture` : 'district.architecture';
  const buildings = urban?.buildings ?? DISTRICT_BUILDINGS;
  const facades = urban ? Object.fromEntries(urban.buildings.map(b=>[b.id,b.facade])) : DISTRICT_FACADES;
  const templates = new Map<DistrictModuleId, Mesh[]>();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const id = object.userData.module_id as DistrictModuleId;
    const meshes = templates.get(id) ?? []; meshes.push(object); templates.set(id, meshes);
  });
  const placements = new Map<DistrictModuleId, Placement[]>();
  const transform = new Object3D(), lotTransform = new Object3D(), faceTransform = new Object3D();
  const roofEnvelopes: Envelope[] = [];
  const put = (id: DistrictModuleId, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1,
    yaw = 0, base?: Matrix4, building?: DistrictBuilding, owner = 'district.props', tint = 1, cloth = 0x71806d) => {
    transform.position.set(x, y, z); transform.rotation.set(0, yaw, 0); transform.scale.set(sx, sy, sz); transform.updateMatrix();
    const matrix = transform.matrix.clone(); if (base) matrix.premultiply(base);
    const entries = placements.get(id) ?? [];
    entries.push({ matrix, plaster: building?.plaster ?? 0xdbceb0, clay: building?.roofColor ?? 0xa95c36,
      cloth, tint, owner }); placements.set(id, entries);
  };
  for (const [index, building] of buildings.entries()) {
    yield 'market.building';
    const { width, depth, floors, floorHeight } = building;
    const profile = FACADE_PROFILES[facades[building.id]!];
    const grammar = urban ? building as UrbanBuilding : null;
    const height = floors * floorHeight;
    lotTransform.position.set(building.position.x, building.position.y, building.position.z);
    lotTransform.rotation.set(0, building.yaw, 0); lotTransform.scale.set(1, 1, 1); lotTransform.updateMatrix();
    const lot = lotTransform.matrix.clone();
    const add = (id: DistrictModuleId, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0, tint = 1) =>
      put(id, x, y, z, sx, sy, sz, yaw, lot, building, building.id, tint);
    // Stone plinth is solid; individual outer blocks express a restrained weathered course.
    add('stone', 0, 0, 0, width + .12, .44, depth + .12, 0, .82);
    const elevations = [
      { yaw: 0, length: width, distance: depth / 2, front: true, back: false },
      { yaw: Math.PI, length: width, distance: depth / 2, front: false, back: true },
      { yaw: Math.PI / 2, length: depth, distance: width / 2, front: false, back: false },
      { yaw: -Math.PI / 2, length: depth, distance: width / 2, front: false, back: false },
    ];
    for (const elevation of elevations) {
      yield 'market.building-elevation';
      faceTransform.position.set(Math.sin(elevation.yaw) * elevation.distance, 0,
        Math.cos(elevation.yaw) * elevation.distance); faceTransform.rotation.set(0, elevation.yaw, 0);
      faceTransform.scale.set(1, 1, 1); faceTransform.updateMatrix();
      const face = lot.clone().multiply(faceTransform.matrix);
      const wall = (id: DistrictModuleId, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, tint = 1) =>
        put(id, x, y, z, sx, sy, sz, 0, face, building, building.id, tint);
      const openings: Opening[] = [];
      if (elevation.front) openings.push({ x: 0, y: .18, width: 1.18, height: 2.16, module: 'door' });
      // A narrower utility rear door distinguishes workshops and canal premises.
      if (elevation.back && grammar?.rearEntrance!==false && (building.archetype === 'workshop' || building.archetype === 'canal')) {
        openings.push({ x: elevation.length * .28, y: .18, width: 1.18, height: 2.16, module: 'door' });
        wall('doorstep', elevation.length * .28, 0, 0, .93);
      }
      for (let floor = 0; floor < floors; floor++) {
        const large = floor === 0 && elevation.front && (building.awning || grammar?.shopfront==='arcade');
        const paired = profile === FACADE_PROFILES.paired && !large && elevation.front;
        const count = grammar && elevation.front ? grammar.bays : Math.max(2, Math.floor(elevation.length / (large ? 3.7 : profile.spacing)));
        const span = elevation.length - (paired ? 2.75 : 2.1);
        for (let bay = 0; bay < count; bay++) {
          const centre = -span / 2 + span * bay / (count - 1) + (elevation.front ? profile.shift : -profile.shift);
          const module = large ? 'shop-window' : 'window';
          const w = large ? (profile.shop === 'wide' ? 2.05 : 1.56) : profile.width;
          const h = large ? 1.46 : profile.height;
          for (const offset of paired ? [-.49,.49] : [0]) {
            const x=centre+offset;
            if (Math.abs(x)+w/2 > elevation.length/2-.28) continue;
            if (floor === 0 && openings.some(o => Math.abs(o.x - x) < (o.width + w) / 2 + .16)) continue;
            if (building.archetype === 'workshop' && !elevation.front && bay === 0 && floor === 0) continue;
            // Service elevations have fewer openings and higher sills.
            if (elevation.back && floor===0 && bay===count-1 && index%2===0) continue;
            openings.push({ x, y: floor * floorHeight + (large ? .81 : h>1.5 ? .72 : 1.01), width:w,height:h,module,
              shutter: profile.shutters==='none' || large || paired ? undefined : ((grammar?.shutterOffset??index)+floor+bay)%4 });
          }
        }
      }
      const xs = [...new Set([-elevation.length / 2, elevation.length / 2,
        ...openings.flatMap(o => [o.x - o.width / 2, o.x + o.width / 2])])].sort((a, b) => a - b);
      const ys = [...new Set([.18, height, ...openings.flatMap(o => [o.y, o.y + o.height])])].sort((a, b) => a - b);
      for (let ix = 0; ix < xs.length - 1; ix++) for (let iy = 0; iy < ys.length - 1; iy++) {
        const a = xs[ix]!, b = xs[ix + 1]!, lo = ys[iy]!, hi = ys[iy + 1]!;
        if (hi <= .18 || lo >= height || b - a < .001 || hi - lo < .001) continue;
        if (openings.some(o => (a + b) / 2 > o.x - o.width / 2 && (a + b) / 2 < o.x + o.width / 2 &&
            (lo + hi) / 2 > o.y && (lo + hi) / 2 < o.y + o.height)) continue;
        wall('wall', (a + b) / 2, lo, 0, b - a, hi - lo);
      }
      for (const o of openings) {
        wall(o.module,o.x,o.y,0,o.width/(o.module==='shop-window'?1.88:o.module==='door'?1.18:1.05),
          o.height/(o.module==='shop-window'?1.47:o.module==='door'?2.16:1.32));
        if (o.shutter!==undefined) for (const side of [-1,1]) {
          const closed=profile.shutters==='closed' && o.shutter===0 || profile.shutters==='utility' && side===1 ||
            profile.shutters==='mixed' && o.shutter===1 && side===-1;
          const angle=side<0 ? (closed?0:Math.PI+(o.shutter===2?.42:0)) : (closed?Math.PI:(o.shutter===3?-.48:0));
          put('shutter',o.x+side*(o.width/2+.075),o.y,.055,o.width/1.05,o.height/1.32,1,
            angle,face,building,building.id,.92+index%3*.035);
        }
      }
      const stoneCount = Math.ceil(elevation.length / .74);
      for (let row = 0; row < 2; row++) for (let stone = 0; stone < stoneCount; stone++) {
        const x = -elevation.length / 2 + (stone + .5) * elevation.length / stoneCount;
        // A threshold occupies the lower stone course on the entrance elevation.
        if (openings.some(o => o.module === 'door' && Math.abs(x - o.x) < .71)) continue;
        wall('stone', x, .022 + row * .207, .025, elevation.length / stoneCount - .018, .194, .12,
          .92 + ((stone + row + index) % 5) * .035);
      }
      for (let floor = 0; floor <= floors; floor++) {
        const y = floor === 0 ? .49 : floor * floorHeight - .10;
        wall('beam', 0, y, .052, elevation.length + .22, floor === floors ? 1.3 : 1);
      }
      const posts = [-elevation.length / 2, elevation.length / 2];
      if (building.archetype === 'residential' || building.archetype === 'workshop') {
        for (const x of [-elevation.length / 4, elevation.length / 4])
          if (!openings.some(o => Math.abs(o.x - x) < o.width / 2 + .13)) posts.push(x);
      }
      for (const x of posts) wall('post', x, .35, .074, 1.05, height - .30);
      if(grammar?.corner==='stone' || grammar?.corner==='pilaster')for(const x of [-elevation.length/2+.13,elevation.length/2-.13])
        wall('stone',x,.44,.025,grammar.corner==='pilaster'?.38:.26,height-.44,.16,.94);
      for (const sign of [-1, 1]) {
        const x = sign * (elevation.length / 2 - .45);
        wall('brace', x, height - .9, .13, .7, .65);
      }
      // Full-height timber rhythm is selective, while wealthier houses use broad plaster.
      if (elevation.front && building.awning) {
        put('awning', profile.shift + (index%2?.38:-.28), 2.51, 0, Math.min(1.55, width / (index%3?7.5:5.8)), 1, index%3===0?1.15:.88, 0, face, building, building.id,
          1, grammar?.cloth ?? (building.archetype === 'workshop' ? 0x7c8871 : index % 2 ? 0x955d48 : 0x4b7771));
        wall('sign', (index%2?1:-1)*(elevation.length / 2 - .72), 3.05 + index%3*.12, .03,
          index%3===0?1.14:.82,.88,.9);
      }
      if (elevation.front && building.balcony) wall('balcony', profile.balcony, floorHeight + .12, .02,
        index%2?.82:1.08);
      if(elevation.front && grammar?.shopfront==='arcade')for(let bay=0;bay<grammar.bays;bay++){
        const x=-width*.42+width*.84*bay/(grammar.bays-1);
        wall('post',x,0,1.65,1.7,3.05,1.7);wall('beam',x,3.0,.95,width/grammar.bays,1.45,1.4);
        put('awning',x,2.96,.12,.76,1,1.35,0,face,building,building.id,1,grammar.cloth);
      }
      // Selective utility hood and stacked repairs form side-street shadow pockets.
      if (!elevation.front && !elevation.back && (building.id==='district.weaver-home' || building.id==='district.bookbinder') && elevation.yaw>0) {
        put('awning',-.55,3.26,0,.65,1,.42,0,face,building,building.id,1,0x79765a);
        wall('beam',-.55,3.48,.12,2.15,.8,1);
        wall('stone',.85,.55,.022,.65,.72,.035,.72);
      }
      if (elevation.front && floors > 1 && index % 3 === 1) {
        wall('crate', -elevation.length * .27, floorHeight + .84, .16, .95, .27, .47);
      }
      if (elevation.front) wall('lantern', .94, 2.58, .04);
    }
    add('doorstep', 0, 0, depth / 2);
    const turned=grammar?.roofDirection===1,roofWidth=turned?depth:width,roofDepth=turned?width:depth;
    add(`roof-${building.roof}` as DistrictModuleId, 0, height, 0,
      roofWidth / 8, building.roofHeight / 2.2, Math.max(roofDepth / 7, (roofDepth + 1.94) / 9),turned?Math.PI/2:0);
    if (building.roof === 'gable') for (const sign of [-1, 1])
      add('gable-cap', turned?sign*width/2:0, height, turned?0:sign*depth/2, roofWidth / 8, building.roofHeight / 2.2, 1,
        (sign===1?0:Math.PI)+(turned?Math.PI/2:0));
    const chimneyY = height + building.roofHeight * .42;
    add('chimney', -width * .26, chimneyY, -depth * .18, index % 3 === 0 ? 1.12 : .9, 1, .95);
    if (building.archetype === 'civic') add('tower', width * .20, height + .36, -depth * .04, 1.25, 1.1, 1.25);
    if (building.archetype === 'workshop' || building.archetype === 'merchant') {
      add('barrel', width / 2 - .52, 0, depth / 2 + .48, .9, .9, .9);
      add('crate', -width / 2 + .58, 0, depth / 2 + .49, .9, .9, .8);
    }
    if (building.id === 'district.boatwright') {
      for (let i = 0; i < 6; i++) add('beam', width * .25, .11 + i * .11, -depth / 2 - .6, 3.5, .52, 1.4, .06);
      add('barrel', -width * .32, 0, -depth / 2 - .5, 1.1, 1.1, 1.1);
    }
    const envelope = new Box3(new Vector3(-width * .585, height - .26, -Math.max(depth * .645, depth / 2 + .99)),
      new Vector3(width * .585, height + building.roofHeight + .30, Math.max(depth * .645, depth / 2 + .99)));
    envelope.applyMatrix4(lot);
    roofEnvelopes.push({ min: envelope.min.toArray() as Envelope['min'], max: envelope.max.toArray() as Envelope['max'] });
    if (building.archetype === 'civic') {
      const towerRoof = new Box3(new Vector3(width * .2 - 3.3, height + 6.2, -depth * .04 - 3.3),
        new Vector3(width * .2 + 3.3, height + 9.6, -depth * .04 + 3.3)).applyMatrix4(lot);
      roofEnvelopes.push({ min: towerRoof.min.toArray() as Envelope['min'], max: towerRoof.max.toArray() as Envelope['max'] });
    }
  }
  // A functional market is grouped around a generous central crossing.
  const marketStalls = urban?.stalls ?? DISTRICT_STALLS.map(s=>({...s,y:4}));
  for (const [i, {x,y,z,yaw,width,depth,cloth,goods}] of marketStalls.entries()) {
    put('stall', x, y, z, width, 1, depth, yaw, undefined, undefined, `${urban?.id??'district'}.market.${i}`, 1,cloth);
    put(goods,x,y+.94,z,width,1,depth,yaw,undefined,undefined,`${urban?.id??'district'}.market.${i}.goods`,1,cloth);
    roofEnvelopes.push({ min: [x - 1.55*width, y+2.13, z - 1.03*depth], max: [x + 1.55*width, y+2.68, z + 1.03*depth] });
  }
  for (const prop of urban?.dressing ?? DISTRICT_DRESSING) put(prop.module,prop.position.x,prop.position.y,prop.position.z,
    ...prop.scale,prop.yaw,undefined,undefined,prop.id,prop.tint);
  if(!urban){
  // Bridge decks and rails align exactly with parent-authored collision.
  for (const bridge of DISTRICT.bridges) {
    const divisions = 35, step = bridge.length / divisions;
    for (let i = 0; i < divisions; i++) put('beam', bridge.x, bridge.y - .10,
      bridge.z - bridge.length / 2 + (i + .5) * step, bridge.width, 1.11, (step - .012) / .20,
      0, undefined, undefined, `district.bridge.${bridge.id}`, .98 + (i % 4) * .025);
    for (const sign of [-1, 1]) {
      const x = bridge.x + sign * (bridge.width / 2 - .13);
      for (let i = 0; i < 7; i++) put('railing', x, bridge.y, bridge.z - bridge.length / 2 + 1 + i * 2,
        .93, 1.095, 1.4, Math.PI / 2, undefined, undefined, `district.bridge.${bridge.id}`);
      put('beam', bridge.x + sign * bridge.width * .30, bridge.y - .39, bridge.z,
        bridge.length / 1, 2.0, 1.7, Math.PI / 2, undefined, undefined, `district.bridge.${bridge.id}`, .78);
      for (const z of [bridge.z - 5.5, bridge.z - 1.8, bridge.z + 1.8, bridge.z + 5.5])
        put('post', x * 0 + bridge.x + sign * bridge.width * .29, -2.2, z, 1.8, 2.28, 1.8,
          0, undefined, undefined, `district.bridge.${bridge.id}`, .84);
    }
  }
  for (const z of [11.84, 26.16]) {
    let start: number = DISTRICT.extent.minX;
    for (const bridge of DISTRICT.bridges) {
      const end = bridge.x - bridge.width / 2 - .20;
      parapet(start, end, z); start = bridge.x + bridge.width / 2 + .20;
    }
    parapet(start, DISTRICT.extent.maxX, z);
  }
  function parapet(start: number, end: number, z: number) {
    put('stone', (start + end) / 2, 0, z, end - start, .89, .32, 0, undefined, undefined, 'district.quay', .90);
    const count = Math.ceil((end - start) / .85), spacing = (end - start) / count;
    for (let i = 0; i < count; i++) put('stone', start + (i + .5) * spacing, .89, z,
      spacing - .012, .16, .40, 0, undefined, undefined, 'district.quay', 1.12);
    // Restrained repair courses and splash-darkened sections on the water face.
    const face=z<19?z+.174:z-.174;
    for(let i=0;i<count;i++)for(let row=0;row<2;row++)
      put('stone',start+(i+.5)*spacing,.12+row*.34,face,spacing-.025,.31,.022,
        0,undefined,undefined,'district.quay.face',.81+((i+row*2)%7)*.027);
  }
  // Old dressed-stone repairs along selected retaining-wall service pockets.
  for(const x of [68,81,109,138])for(let row=0;row<3;row++)for(let c=0;c<4;c++)
    put('stone',x+c*.67+(row%2?.19:0),.22+row*.46,1.018,.64,.43,.032,
      0,undefined,undefined,'district.quay.retaining-repairs',.81+(row+c)%4*.04);
  for (const stair of DISTRICT.stairs) for (let i = 0; i < stair.count; i++) {
    const civic = stair.id === 'civic', top = civic ? 4 + (i + 1) * stair.rise : (stair.count - i) * stair.rise;
    put('stair', stair.x, top - .18, stair.z + i * stair.tread, stair.width, 1,
      Math.abs(stair.tread) / .30, 0, undefined, undefined, `district.stairs.${stair.id}`,
      .95 + (i % 4) * .025);
  }
  }
  // Bracket lanterns intentionally coincide with parent-owned measured light positions.
  for (const [x, y, z] of urban?.lamps ?? DISTRICT_LAMPS) {
    put('post', x!, urban ? y!-2.6 : 0 + (y! > 4 ? 4 : 0), z!, 1.05, y! > 4 ? 2.6 : 2.7, 1.05,
      0, undefined, undefined, 'district.lights');
    put('lantern', x!, y! - .10, z! - .45, 1, 1, 1, 0, undefined, undefined, 'district.lights');
  }

  const instances: Record<string, number> = {};
  const usedGeometry = new Set<BufferGeometry>(), usedMaterials = new Set<Material>();
  for (const [id, entries] of placements) for (const prototype of templates.get(id) ?? []) {
    const material = prototype.material as MeshStandardMaterial;
    const mesh = ownership.own(new InstancedMesh(prototype.geometry, material, entries.length));
    mesh.name = `district.instances.${id}.${material.name}`;
    mesh.castShadow = !/^(window_|recess_shadow)/.test(material.name); mesh.receiveShadow = true;
    for (const [i, p] of entries.entries()) {
      if (i % 64 === 0) yield 'market.module-transforms';
      mesh.setMatrixAt(i, p.matrix.clone().multiply(prototype.matrixWorld));
      const tint = material.name.startsWith('plaster') ? new Color(p.plaster)
        : material.name.startsWith('terracotta') ? new Color(p.clay)
        : material.name === 'cloth_color' ? new Color(p.cloth) : new Color(1, 1, 1);
      tint.multiplyScalar(p.tint); mesh.setColorAt(i, tint);
    }
    mesh.userData.moduleId = id;
    mesh.userData.buildingIds = entries.map(p => p.owner);
    mesh.computeBoundingSphere(); mesh.computeBoundingBox(); group.add(mesh);
    instances[mesh.name] = mesh.count; usedGeometry.add(prototype.geometry); usedMaterials.add(material);
    yield 'market.module-bounds';
  }
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (!usedGeometry.has(object.geometry)) ownership.release(object.geometry);
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) if (!usedMaterials.has(mat)) ownership.release(mat);
  });
  return { group, facts: { ...inspectDistrictKit(root), buildings: buildings.length,
    archetypes: [...new Set(buildings.map(b => b.archetype))],
    buildingIds: buildings.map(b => b.id), instances,
    instanceBatches: Object.keys(instances).length,
    totalInstances: Object.values(instances).reduce((sum, n) => sum + n, 0),
    roofEnvelopes, marketStalls,
    facadeProfiles: facades, dressing: (urban?.dressing??DISTRICT_DRESSING).length,
    assumptions: 'Unseen elevations, guild belfry and local trade dressing are authored interpretations; closed doors have future interior hooks.' } };
}

export async function createDistrictPresentation(_course?: CourseSpec, signal?: AbortSignal,
  scheduler?: PreparationScheduler, scope?: PreparationResources, target?: Group) {
  const loaded = await loadDistrictKit(signal, scheduler, scope);
  const architecture = scheduler ? await scheduler.run('market.architecture', districtArchitectureJobs(loaded.root, scope, target))
    : finishPreparation(districtArchitectureJobs(loaded.root, scope, target));
  return scheduler ? scheduler.run('market.decoration', districtDecorationJobs(architecture, loaded, scope))
    : finishPreparation(districtDecorationJobs(architecture, loaded, scope));
}
function* districtDecorationJobs(architecture: ReturnType<typeof composeDistrictArchitecture>, loaded: Awaited<ReturnType<typeof loadDistrictKit>>, scope?: PreparationResources) {
  const ownership = preparationResources(scope);
  const group = architecture.group;
  // Plaster spans are partitioned at genuine openings. World-coordinate pigment
  // keeps their wash continuous instead of restarting the texture at every panel.
  const plasterNodes = new Map<MeshStandardMaterial, MeshStandardNodeMaterial>();
  group.traverse(object => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const source = object.material;
    if (!source.name.startsWith('plaster') || !source.map) return;
    let nodeMaterial = plasterNodes.get(source);
    if (!nodeMaterial) {
      nodeMaterial = ownership.own(new MeshStandardNodeMaterial().copy(source) as MeshStandardNodeMaterial);
      nodeMaterial.name = source.name; nodeMaterial.vertexColors = false;
      const across = positionWorld.x.mul(normalWorld.z.abs()).add(positionWorld.z.mul(normalWorld.x.abs()));
      nodeMaterial.colorNode = texture(source.map, vec2(across.div(4), positionWorld.y.div(4))).mul(materialColor);
      plasterNodes.set(source, nodeMaterial);
    }
    object.material = nodeMaterial;
  });
  for (const source of plasterNodes.keys()) ownership.release(source);
  const ground = yield* districtGroundJobs(scope); group.add(ground.group);
  const landscape = yield* landscapeMaterialJobs(scope);
  const waterGeometry = ownership.own(new PlaneGeometry(98, 14, 65, 10));
  waterGeometry.rotateX(-Math.PI / 2); waterGeometry.translate(97, -1.16, 19);
  const positions = waterGeometry.getAttribute('position');
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), edge = Math.min(z - 12, 26 - z);
    const color = new Color(0x638f76).lerp(new Color(0x247e80), Math.min(1, Math.max(0, edge) / 4));
    color.multiplyScalar(.96 + Math.sin(x * .27 + z * .43) * .07); colors.push(color.r, color.g, color.b);
  }
  waterGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const water = new Mesh(waterGeometry, new MeshStandardMaterial({ vertexColors: true, roughness: .29, metalness: .08 }));
  water.name = 'district.water.turquoise-current'; water.receiveShadow = true; group.add(water);
  // Landscape palette is shared with the accepted rural ground. Paving has broad authored washes.
  const paving = ground.paving;
  const pavingMat = paving.material as MeshStandardMaterial;
  pavingMat.map = landscape.stone.map;
  const uv: number[] = [];
  const p = paving.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) { if (i % 512 === 0) yield 'market.paving-uv'; uv.push(p.getX(i) / 8, p.getZ(i) / 8); }
  paving.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  // Only intentional garden pockets are added; no props fill the route or plaza center.
  const ecology = new Map<string, {geometry: BufferGeometry; shadows: boolean}>();
  yield* ecologyRegistrationJobs((name, geometry, shadows = false) => { ecology.set(name, { geometry, shadows }); }, scope);
  const pockets: [string, number, number, number, number][] = DISTRICT_GARDENS
    .filter(garden => garden.tree).map(garden => [garden.tree, garden.x, garden.y, garden.z, garden.scale]);
  for (const [index, building] of DISTRICT_BUILDINGS.entries()) if (building.floors > 1 && index % 3 === 1) {
    for (let i = 0; i < 5; i++) {
      const x = -building.width * .27 + (i - 2) * .14, z = building.depth / 2 + .34;
      pockets.push([i % 2 ? 'white' : 'short', building.position.x + Math.cos(building.yaw) * x + Math.sin(building.yaw) * z,
        building.position.y + building.floorHeight + 1.03,
        building.position.z - Math.sin(building.yaw) * x + Math.cos(building.yaw) * z, .55]);
    }
  }
  const gardenGround = ownership.own(new BufferGeometry()), gardenVertices: number[] = [], gardenColors: number[] = [];
  const gardenRandom = randomSequence(104749);
  for (const [index, garden] of DISTRICT_GARDENS.entries()) {
    yield 'market.garden';
    const radius = (angle: number) => 1 + Math.sin(angle * 3 + index) * .09 + Math.cos(angle * 5 - index) * .05;
    for (let sector = 0; sector < 18; sector++) {
      const a = sector / 18 * Math.PI * 2, b = (sector + 1) / 18 * Math.PI * 2;
      for (const [x,z] of [[garden.x,garden.z], [garden.x + Math.cos(b) * garden.rx * radius(b),garden.z + Math.sin(b) * garden.rz * radius(b)],
        [garden.x + Math.cos(a) * garden.rx * radius(a),garden.z + Math.sin(a) * garden.rz * radius(a)]]) {
        gardenVertices.push(x!, garden.y + .03, z!);
        const tint = new Color(index % 3 ? 0x697743 : 0x78754e).multiplyScalar(.94 + gardenRandom() * .13);
        gardenColors.push(tint.r,tint.g,tint.b);
      }
    }
    const kinds = ['ecology-clover','short','fern','white','ecology-groundcover','yellow'];
    for (let i = 0; i < Math.ceil(garden.rx * garden.rz * 16); i++) {
      const angle = gardenRandom() * Math.PI * 2, r = Math.sqrt(gardenRandom()) * .9;
      pockets.push([kinds[(i + index) % kinds.length]!, garden.x + Math.cos(angle) * garden.rx * r,
        garden.y + .04, garden.z + Math.sin(angle) * garden.rz * r, .58 + gardenRandom() * .45]);
    }
    if (garden.rx > 1.5) pockets.push([index % 2 ? 'shrub-wiry' : 'shrub-spreading', garden.x + garden.rx * .5,
      garden.y + .04, garden.z + garden.rz * .23, .66]);
  }
  gardenGround.setAttribute('position',new Float32BufferAttribute(gardenVertices,3));
  gardenGround.setAttribute('color',new Float32BufferAttribute(gardenColors,3)); gardenGround.computeVertexNormals();
  const gardenMesh = new Mesh(gardenGround,new MeshStandardMaterial({vertexColors:true,roughness:1}));
  gardenMesh.name='district.gardens.courtyard-soil-and-moss'; gardenMesh.receiveShadow=true; group.add(gardenMesh);
  for (const name of new Set(pockets.map(pocket => pocket[0]))) {
    const source = ecology.get(name)!;
    const items = pockets.filter(pocket => pocket[0] === name);
    const mesh = ownership.own(new InstancedMesh(source.geometry, ownership.own(new MeshStandardMaterial({vertexColors:true, roughness:.97})), items.length));
    mesh.name = `district.instances.${name}`; mesh.castShadow = source.shadows; mesh.receiveShadow = true;
    const object = new Object3D();
    for (const [i, [,x,y,z,scale]] of items.entries()) {
      if (i % 128 === 0) yield 'market.garden-transforms';
      object.position.set(x,y,z); object.scale.setScalar(scale); object.rotation.y = i * 1.7;
      object.updateMatrix(); mesh.setMatrixAt(i,object.matrix);
    }
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  for (const [name, source] of ecology) if (!pockets.some(pocket => pocket[0] === name)) ownership.release(source.geometry);
  // The three landscape materials not retained by district paving never enter the scene.
  for (const material of [landscape.grass, landscape.path, landscape.soil, landscape.stone]) {
    if (material !== landscape.stone && material.map) ownership.release(material.map); ownership.release(material);
  }
  const surfaces = new Map<MeshStandardMaterial, {color: Color; roughness: number}>();
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (/^district\.instances\.(?:tree-|shrub)/.test(object.name)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if ((material instanceof MeshStandardMaterial || material instanceof MeshStandardNodeMaterial) && !surfaces.has(material as MeshStandardMaterial))
        surfaces.set(material as MeshStandardMaterial, {color: material.color.clone(),roughness:material.roughness});
    }
  });
  function update(elapsed: number, wind = .25, rain = 0) {
    const response = 1 + Math.max(0, wind - .25) * .35 + rain * .40;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, -1.16 + (Math.sin(x * .65 + z * 1.6 + elapsed * .85) * .023 +
        Math.sin(x * 1.9 - z * .5 - elapsed * .55) * .009) * response);
    }
    positions.needsUpdate = true; waterGeometry.computeVertexNormals();
  }
  function updateEnvironment(environment: EnvironmentState) {
    const warmth = Math.max(0, Math.min(1, (1.85 - environment.lighting.fillIntensity) / .67));
    ground.updateWarmth(warmth);
    for (const [material, source] of surfaces) {
      if (material.name.startsWith('window_')) {
        material.emissive.set(0xffba62); material.emissiveIntensity = warmth * (material.name === 'window_warm' ? 1.2 : .32);
      } else if (!material.name.startsWith('produce')) {
        material.color.copy(source.color).multiplyScalar(1 - environment.wetness * .09);
        material.roughness = Math.max(.31, source.roughness - environment.wetness * .16);
      }
    }
  }
  update(0);
  const facts = { ...architecture.facts, loadedAssets: [loaded.facts], loadedAssetCount: 1,
    gardenInstances: pockets.length, dynamicLights: 0, localLightSurfaces: 31, ground: ground.facts,
    water: 'Same meter height, turquoise edge colors and wave equation as accepted rural water; x48..146,z12..26.',
    materialTreatment: 'Existing project-authored hero pigment maps plus per-instance plaster/clay/cloth palettes; no reference sampling.' };
  group.userData.district = facts;
  return { group, update, updateEnvironment, facts };
}
