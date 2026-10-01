import {
  Box3, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Group,
  InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, SphereGeometry, PointLight, Vector3,
} from 'three';
import type { DirectionalLight, HemisphereLight, Material, Scene } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { Fn, If, instanceIndex, positionGeometry, positionLocal, sin, smoothstep, uniform, vec3 } from 'three/tsl';
import { RURAL } from '../simulation/rural-layout';
import { DISTRICT_LAMPS } from '../simulation/district-art';
import { createRuralCourse } from '../simulation/rural';
import type { EnvironmentColor, EnvironmentState } from '../simulation/environment';
import type { CourseSpec, Vec3 } from '../simulation/types';

type WindKind = 'tree' | 'plant' | 'shrub';
type Replacement = { source: MeshStandardMaterial; material: MeshStandardMaterial | MeshStandardNodeMaterial; darkening: number };
const RAIN_DROPS = 720;
const REDUCED_RAIN_DROPS = 216;
const CLOUD_LOBES = 48;
const RAIN_RADIUS = 23;
const RAIN_CEILING = 27;

function windKind(name: string): WindKind | null {
  if (!name.startsWith('rural.instances.') && !name.startsWith('district.instances.')) return null;
  const item = name.replace(/^(?:rural|district)\.instances\./, '');
  if (item.startsWith('tree-')) return 'tree';
  if (item.startsWith('shrub')) return 'shrub';
  return /^(short|tall|reed|wheat|white|yellow|weed|dry|fern|ecology-groundcover|ecology-clover)$/.test(item) ? 'plant' : null;
}

function applyColor(target: Color, value: EnvironmentColor) { target.setRGB(value.r, value.g, value.b); }
function fraction(value: number) { return value - Math.floor(value); }
function sample(index: number, salt: number) { return fraction(Math.sin(index * 127.1 + salt * 311.7) * 43758.5453); }

/** Presentation only. The approved source positions, indices and instance matrices stay untouched. */
export function createEnvironmentPresentation(scene: Scene, sun: DirectionalLight, fill: HemisphereLight,
  course: CourseSpec = createRuralCourse(), districtRoofs: { min: number[]; max: number[] }[] = []) {
  const streaming = course.id === 'm5-streaming-proof' || course.id === 'm6-city-blueprint';
  const district = course.id === 'm4-market-district' || streaming;
  const group = new Group();
  group.name = 'living.environment';
  const lantern = new PointLight(0xffcc83, 0, 11, 2);
  lantern.name = 'living.garden-lantern'; lantern.position.set(15.35, 5.4, -3.8); group.add(lantern);
  let lanternGlass = scene.getObjectByName('garden.lantern.inferred');
  const districtLamps = district ? DISTRICT_LAMPS
    .map(([x, y, z], i) => {
      const light = new PointLight(0xffcb89, 0, 12, 2);
      light.name = `living.district-lamp.${i}`; light.position.set(x!, y!, z!);
      light.castShadow = false; group.add(light); return light;
    }) : [];
  const time = uniform(0), strength = uniform(0.22), quality = uniform(1);
  const originals: { mesh: Mesh; material: Material | Material[]; owner: string }[] = [];
  const replacements = new Map<string, Replacement>();
  let windBatches = 0, windInstances = 0;
  let disposed = false;
  let lastRainKey = '', lastCloudTime = -1;
  let reduced = false, rainCount = 0, shelterClipped = 0, outOfBounds = 0;
  let environmentTime = 0, weather = 'clear', timeOfDay = 'day';

  function replace(source: MeshStandardMaterial, kind: WindKind | null) {
    const key = `${source.uuid}:${kind ?? 'surface'}`;
    const existing = replacements.get(key);
    if (existing) return existing.material;
    const material = kind ? new MeshStandardNodeMaterial().copy(source) as MeshStandardNodeMaterial : source.clone();
    material.name = `${source.name}.living-${kind ?? 'surface'}`;
    if (kind && material instanceof MeshStandardNodeMaterial) {
      // r186 NodeMaterial.setupPosition applies the instance transform BEFORE
      // positionNode. Read positionGeometry for the anchored local height, then
      // add displacement to positionLocal so every original instance stays put.
      material.positionNode = Fn(() => {
        const phase = positionLocal.x.mul(0.16).add(positionLocal.z.mul(0.11)).add(instanceIndex.toFloat().mul(0.73));
        const wave = sin(time.mul(1.16).add(phase)).mul(0.72).toVar();
        // The reduced path uses one slow gust, omitting the second harmonic.
        If(quality.greaterThan(0.5), () => {
          wave.addAssign(sin(time.mul(2.3).add(phase.mul(1.7))).mul(0.28));
        });
        const height = positionGeometry.y.max(0);
        const response = kind === 'tree' ? smoothstep(3.1, 8.5, height).mul(0.34)
          : height.mul(kind === 'shrub' ? 0.13 : 0.21).mul(smoothstep(0, 0.09, height));
        const bend = wave.mul(response).mul(strength);
        return positionLocal.add(vec3(bend, 0, bend.mul(0.46)));
      })();
    }
    replacements.set(key, { source, material, darkening: kind ? 0.045 : 0.095 });
    return material;
  }

  const roofEnvelopes: Box3[] = [];
  const roofOwners = new Map<string, Box3[]>();
  const windOwners = new Map<string, { batches: number; instances: number }>();
  const loadedAreas = new Set<string>();
  function rebuildRoofs() { roofEnvelopes.splice(0, roofEnvelopes.length, ...[...roofOwners.values()].flat()); }
  function attachArea(owner: string, root: Object3D, roofs: { min: number[]; max: number[] }[] = []) {
    if (roofOwners.has(owner)) throw new Error(`Environment hooks already attached: ${owner}`);
    const beforeBatches = windBatches, beforeInstances = windInstances;
    root.updateMatrixWorld(true);
    const ownerRoofs: Box3[] = roofs.map(roof => new Box3(
      new Vector3().fromArray(roof.min), new Vector3().fromArray(roof.max)));
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      // The modular kit owns its wetness/emissive response and supplies individual
      // roof bounds; treating its aggregate instance bounds as a roof would hide rain.
      if (object.name.startsWith('district.') && !windKind(object.name)) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      // Actual imported roof bounds include the cottage and shed overhangs. A
      // conservative top envelope prevents rain appearing beneath a sloped roof.
      if (!object.name.startsWith('district.') && (sourceMaterials.some(material => /^(terracotta|teal_)/.test(material.name)) || /(?:roof|shelter)/i.test(object.name))) {
        const bounds = new Box3().setFromObject(object, true);
        if (!bounds.isEmpty()) { bounds.min.x -= 0.25; bounds.max.x += 0.25; bounds.min.z -= 0.25; bounds.max.z += 0.25; ownerRoofs.push(bounds); }
      }
      if (object.name.startsWith('water.') && !object.name.includes('bank')) return;
      const kind = windKind(object.name);
      // Only the accepted rural scene is adapted; diagnostic avatar/labels and
      // later-created NPC materials remain independently owned by their systems.
      if (!kind && !/^(terrain\.|path\.|stairs\.|garden\.|crop\.|rural\.|blockout\.)/.test(object.name) &&
        !sourceMaterials.some(material => /^(plaster|timber|door_oak|bridge_oak|terracotta|teal_|stone)/.test(material.name))) return;
      const changed = sourceMaterials.map(material => material instanceof MeshStandardMaterial && material.roughness >= 0.4 ? replace(material, kind) : material);
      if (changed.every((material, i) => material === sourceMaterials[i])) return;
      originals.push({ mesh: object, material: object.material, owner });
      object.material = Array.isArray(object.material) ? changed : changed[0]!;
      if (kind) { windBatches++; windInstances += object instanceof InstancedMesh ? object.count : 1; }
    });

    roofOwners.set(owner, ownerRoofs);
    windOwners.set(owner, { batches: windBatches - beforeBatches, instances: windInstances - beforeInstances });
    rebuildRoofs();
  }
  function detachArea(owner: string) {
    for (let i = originals.length - 1; i >= 0; i--) {
      const original = originals[i]!;
      if (original.owner === owner) { original.mesh.material = original.material; originals.splice(i, 1); }
    }
    const retained = new Set(originals.flatMap(original => Array.isArray(original.material) ? original.material : [original.material]));
    for (const [key, replacement] of replacements) if (!retained.has(replacement.source)) {
      replacement.material.dispose(); replacements.delete(key);
    }
    roofOwners.delete(owner); loadedAreas.delete(owner); rebuildRoofs();
    const wind = windOwners.get(owner);
    if (wind) { windBatches -= wind.batches; windInstances -= wind.instances; windOwners.delete(owner); }
  }
  attachArea('initial', scene, districtRoofs);

  // Small distant sky masses, outside the ground area and above roof height.
  // They never cast shadows or add terrain, and do not cover the eagle-eye slice.
  const cloudGeometry = new SphereGeometry(1, 9, 6);
  const cloudMaterial = new MeshBasicMaterial({ color: 0xe0e4e1, transparent: true, opacity: 0.03, depthWrite: false });
  const clouds = new InstancedMesh(cloudGeometry, cloudMaterial, CLOUD_LOBES);
  clouds.name = 'living.clouds'; clouds.frustumCulled = false;
  const cloudCenters = Array.from({ length: CLOUD_LOBES }, (_, index) => {
    const cluster = index % 8, lobe = Math.floor(index / 8);
    return { x: -86 + cluster * 23 + (sample(index, 1) - 0.5) * 12,
      y: 38 + sample(cluster, 8) * 7 + sample(index, 7) * 1.5,
      z: -76 - sample(cluster, 3) * 18 + (sample(index, 5) - 0.5) * 5,
      sx: 4.4 + sample(index, 11) * 4.8, sy: 1.0 + sample(index, 12) * 1.4,
      sz: 2.2 + sample(index, 13) * 3.2, phase: lobe * 0.3 + cluster };
  });
  group.add(clouds);

  const rainGeometry = new BufferGeometry();
  const rainPositions = new Float32BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3);
  rainPositions.setUsage(DynamicDrawUsage);
  rainGeometry.setAttribute('position', rainPositions);
  const rainMaterial = new LineBasicMaterial({ color: 0xb6c9ca, transparent: true, opacity: 0, depthWrite: false });
  const rain = new LineSegments(rainGeometry, rainMaterial);
  rain.name = 'living.rain'; rain.frustumCulled = false; rain.visible = false;
  group.add(rain); scene.add(group);

  const ground = course.surfaces!.filter(surface => surface.id.endsWith('.top'));
  const rainObstacles = course.boxes.filter(box => /^(?:district\.)?(?:stairs\.|bridge\..*deck\.|garden\.bed\.)/.test(box.id));
  function groundHeight(x: number, z: number) {
    let height = -1.1;
    for (const surface of ground) {
      if (surface.vertices[1]! <= height) continue;
      let inside = false;
      const vertices = surface.vertices;
      for (let i = 0, j = vertices.length / 3 - 1; i < vertices.length / 3; j = i++) {
        const xi = vertices[i * 3]!, zi = vertices[i * 3 + 2]!, xj = vertices[j * 3]!, zj = vertices[j * 3 + 2]!;
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) height = surface.vertices[1]!;
    }
    for (const box of rainObstacles) {
      if (Math.abs(x - box.position.x) <= box.size.x / 2 && Math.abs(z - box.position.z) <= box.size.z / 2) {
        height = Math.max(height, box.position.y + box.size.y / 2);
      }
    }
    return height + 0.04;
  }
  const transform = new Object3D();
  const background = scene.background instanceof Color ? scene.background : new Color();
  scene.background = background;

  function update(state: EnvironmentState, player: Vec3, reducedQuality: boolean) {
    if (disposed) return;
    reduced = reducedQuality; environmentTime = state.time; weather = state.weather; timeOfDay = state.timeOfDay;
    time.value = state.time;
    strength.value = state.wind * (reduced ? 0.7 : 1);
    quality.value = reduced ? 0 : 1;
    const lighting = state.lighting;
    const lampStrength = Math.max(0, Math.min(1, (1.85 - lighting.fillIntensity) / 0.67));
    lanternGlass = scene.getObjectByName('garden.lantern.inferred');
    lantern.intensity = lampStrength * 7 * (!streaming || loadedAreas.has('rural') ? 1 : 0);
    districtLamps.forEach(light => { light.intensity = lampStrength * 10 * (!streaming || loadedAreas.has('river-market') ? 1 : 0); });
    if (lanternGlass instanceof Mesh && lanternGlass.material instanceof MeshStandardMaterial) {
      lanternGlass.material.emissive.setHex(0xffcc83); lanternGlass.material.emissiveIntensity = lampStrength * 0.65;
    }
    sun.position.set(lighting.sunPosition.x + (district ? 50 : 0), lighting.sunPosition.y, lighting.sunPosition.z);
    sun.intensity = lighting.sunIntensity; applyColor(sun.color, lighting.sunColor);
    fill.intensity = lighting.fillIntensity; applyColor(fill.color, lighting.fillColor); applyColor(fill.groundColor, lighting.groundColor);
    applyColor(background, lighting.skyColor);
    for (const { source, material, darkening } of replacements.values()) {
      material.color.copy(source.color).multiplyScalar(1 - state.wetness * darkening);
      material.roughness = Math.max(Math.min(0.46, source.roughness), source.roughness - state.wetness * (darkening > 0.05 ? 0.19 : 0.03));
    }
    clouds.count = reduced ? 24 : CLOUD_LOBES;
    cloudMaterial.opacity = state.cloudiness * 0.53;
    cloudMaterial.color.copy(background).lerp(new Color(0xe1e4df), 0.55 * Math.min(1, lighting.fillIntensity / 1.85));
    const cloudTime = reduced ? Math.floor(state.time * 5) / 5 : state.time;
    if (cloudTime !== lastCloudTime) {
      for (const [index, cloud] of cloudCenters.entries()) {
        transform.position.set(cloud.x + (district ? 50 : 0) + Math.sin(cloudTime * 0.035 + cloud.phase) * (2 + state.wind * 3), cloud.y, cloud.z);
        transform.rotation.set(0, 0, 0); transform.scale.set(cloud.sx, cloud.sy, cloud.sz); transform.updateMatrix();
        clouds.setMatrixAt(index, transform.matrix);
      }
      clouds.instanceMatrix.needsUpdate = true; lastCloudTime = cloudTime;
    }
    rain.visible = state.rain > 0.005;
    rainMaterial.opacity = state.rain * (reduced ? 0.45 : 0.32);
    const rainTime = reduced ? Math.floor(state.time * 30) / 30 : state.time;
    // World-fixed column anchors prevent the rain from sliding with every small
    // player movement. CPU buffers update at simulation cadence, never wall time.
    const anchorX = Math.round(player.x / 4) * 4, anchorZ = Math.round(player.z / 4) * 4;
    const rainKey = `${rainTime}:${anchorX}:${anchorZ}:${reduced}:${state.wind}:${state.rain}`;
    if (rainKey !== lastRainKey) {
      rainCount = 0; shelterClipped = 0; outOfBounds = 0;
      const limit = reduced ? REDUCED_RAIN_DROPS : RAIN_DROPS;
      if (rain.visible) for (let index = 0; index < limit; index++) {
        const angle = sample(index, 20) * Math.PI * 2, radius = Math.sqrt(sample(index, 21)) * RAIN_RADIUS;
        const x = anchorX + Math.cos(angle) * radius, z = anchorZ + Math.sin(angle) * radius;
        if (x <= -47.7 || x >= (streaming ? 217.7 : district ? 145.7 : 47.7) || Math.abs(z) >= 47.7) { outOfBounds++; continue; }
        let bottom = groundHeight(x, z);
        for (const roof of roofEnvelopes) if (x >= roof.min.x && x <= roof.max.x && z >= roof.min.z && z <= roof.max.z) {
          bottom = Math.max(bottom, roof.max.y + 0.12); shelterClipped++; break;
        }
        const height = RAIN_CEILING - bottom;
        if (height <= 0.5) { shelterClipped++; continue; }
        const y = bottom + fraction(sample(index, 22) - rainTime * (7.2 + sample(index, 23) * 2) / height) * height;
        const length = Math.min(0.38 + sample(index, 24) * 0.25, y - bottom);
        const tilt = state.wind * length * 0.25;
        rainPositions.setXYZ(rainCount * 2, x, y, z);
        rainPositions.setXYZ(rainCount * 2 + 1, x + tilt, y - length, z + tilt * 0.4);
        rainCount++;
      }
      rainGeometry.setDrawRange(0, rainCount * 2); rainPositions.needsUpdate = true; lastRainKey = rainKey;
    }
  }

  return {
    update, attachArea, detachArea,
    areaActive(owner: string, active: boolean) { if (active) loadedAreas.add(owner); else loadedAreas.delete(owner); },
    stats() {
      return { weather, timeOfDay, animationTime: environmentTime, reduced, windBatches, windInstances,
        windShader: 'TSL positionNode; local height anchor; one gust in reduced mode, two harmonics at full quality',
        surfaceMaterials: replacements.size, cloudLobes: clouds.count, rainDrops: rainCount,
        rainCapacity: RAIN_DROPS, rainReducedCapacity: REDUCED_RAIN_DROPS,
        rainColumnsClippedByShelter: shelterClipped, rainColumnsSkippedOutsideBounds: outOfBounds,
        rainGroundBounds: district ? { minX: -48, maxX: streaming ? 218 : 146, minZ: -48, maxZ: 48 } : RURAL.bounds,
        localLights: 1 + districtLamps.length, shadowCastingLocalLights: 0,
        roofEnvelopes: roofEnvelopes.map(bounds => ({ min: bounds.min.toArray(), max: bounds.max.toArray() })),
        areaHooks: [...roofOwners.keys()].filter(id => id !== 'initial'), activeAreaHooks: [...loadedAreas],
        ownership: 'source geometry, instance matrices and shared textures unchanged; restores original materials on disposal',
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const original of originals) original.mesh.material = original.material;
      for (const replacement of replacements.values()) replacement.material.dispose();
      originals.length = 0; replacements.clear(); roofOwners.clear(); windOwners.clear(); loadedAreas.clear();
      clouds.dispose(); cloudGeometry.dispose(); cloudMaterial.dispose();
      rainGeometry.dispose(); rainMaterial.dispose(); group.removeFromParent(); group.clear();
    },
  };
}
