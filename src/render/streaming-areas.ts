import {
  BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh,
  Material, Mesh, MeshStandardMaterial, Sprite, Texture,
} from 'three';
import type { Object3D } from 'three';
import type { WorldArea } from '../simulation/streaming-contracts';
import type { GameState } from '../simulation/types';
import { NPC_DEFINITIONS, DISTRICT_POPULATION_DEFINITIONS } from '../simulation/npcs';
import { loadRuralAssets } from '../assets/rural';
import { createRuralEnvironment, LANES } from './rural';
import { createDistrictPresentation } from './district';
import { createNpcPresentation } from './npcs';
import { createLandscapeMaterials, applyTerrainPigment, applyLandscapeUV } from './landscape-materials';
import { ResourceReferences, AssetReferences } from '../assets/resource-references';
import { tail } from '../diagnostics/tail';

type Disposable = { dispose(): void };
/** Includes the original materials. Environment hooks restore them before release. */
export function objectResources(root: Object3D): Set<Disposable> {
  const resources = new Set<Disposable>();
  root.traverse(object => {
    if (object instanceof InstancedMesh) resources.add(object);
    if (object instanceof Mesh || object instanceof Sprite) {
      if (object instanceof Mesh) resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) resources.add(value);
      }
    }
  });
  return resources;
}
export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Obsolete area load', 'AbortError');
}

/** Builds accepted rural/market art unchanged, or the explicitly modest M5 shell.
 * Nothing is attached to the main scene until its caller prepares the shaders.
 */
export async function createAreaPresentation(area: WorldArea, signal: AbortSignal, blockout: boolean,
  resources: ResourceReferences, assets: AssetReferences) {
  throwIfAborted(signal);
  const group = new Group(); group.name = `streaming.area.${area.id}`;
  const extraResources = new Set<Disposable>();
  const releaseAssets = assets.acquire(area.assetIds);
  let released = false;
  let releaseResources: (() => void) | null = null;
  function dispose() {
    if (released) return; released = true;
    group.removeFromParent();
    try {
      if (releaseResources) releaseResources();
      else {
        const failures: unknown[] = [];
        for (const resource of new Set([...objectResources(group), ...extraResources])) {
          try { resource.dispose(); } catch (error) { failures.push(error); }
        }
        if (failures.length) throw new AggregateError(failures, 'Partial area disposal failed.');
      }
    } finally { group.clear(); releaseAssets(); }
  }
  try {
    const boxGeometry = new BoxGeometry(1, 1, 1); extraResources.add(boxGeometry);
    const materials = new Map<number, MeshStandardMaterial>();
    for (const box of area.course.boxes) {
      if (box.visible === false) continue;
      if (!blockout && (box.id.startsWith('district.stairs.') || /^stairs\.(main|crop)\.\d+$/.test(box.id))) continue;
      let material = materials.get(box.color);
      if (!material) { material = new MeshStandardMaterial({ color: box.color, roughness: .92 }); materials.set(box.color, material); }
      const mesh = new Mesh(boxGeometry, material); mesh.name = box.id;
      mesh.position.set(box.position.x, box.position.y, box.position.z);
      mesh.scale.set(box.size.x, box.size.y, box.size.z);
      mesh.rotation.set(box.rotationX ?? 0, box.rotationY ?? 0, 0);
      mesh.receiveShadow = true; mesh.castShadow = box.collides && Math.max(box.size.x, box.size.z) < 40;
      group.add(mesh);
    }
    const landscape = !blockout && area.id !== 'neighbor-shell' ? tail.span('streaming.landscapeMaterials', createLandscapeMaterials) : null;
    if (landscape) for (const material of Object.values(landscape)) {
      extraResources.add(material); if (material.map) extraResources.add(material.map);
      if (material === landscape.stone || material === landscape.soil) material.vertexColors = true;
    }
    tail.span('streaming.terrainConstruction', () => {
      for (const surface of area.course.surfaces ?? []) {
        let geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(surface.vertices, 3));
        geometry.setIndex(surface.indices); geometry.computeVertexNormals();
        const market = surface.id.startsWith('district.');
        const cliff = surface.id.endsWith('.cliff') || surface.id.endsWith('.edge');
        if (landscape) {
          geometry = applyTerrainPigment(geometry, area.course, LANES, cliff, surface.id.endsWith('.shore'));
          applyLandscapeUV(geometry, cliff ? 'cliff' : 'ground');
        }
        const material = landscape ? (cliff || market ? landscape.stone : surface.id.endsWith('.shore') ? landscape.soil : landscape.grass)
          : new MeshStandardMaterial({ color: surface.color, roughness: 1 });
        const mesh = new Mesh(geometry, material); mesh.name = surface.id;
        mesh.receiveShadow = true; mesh.castShadow = true;
        if (!blockout && surface.id.endsWith('.shore')) mesh.visible = false;
        group.add(mesh);
      }
    });
    throwIfAborted(signal);
    const rural = area.id === 'rural' ? tail.span('streaming.ruralConstruction', () => createRuralEnvironment(area.course, blockout)) : null;
    if (rural) group.add(rural.group);
    const ruralAssets = rural && !blockout ? await tail.asyncSpan('streaming.ruralAssets', () => loadRuralAssets(rural.group, signal)) : [];
    throwIfAborted(signal);
    const market = area.id === 'river-market' && !blockout
      ? await tail.asyncSpan('streaming.marketConstruction', () => createDistrictPresentation(area.course, signal)) : null;
    if (market) group.add(market.group);
    throwIfAborted(signal);
    const definitions = area.id === 'rural' ? NPC_DEFINITIONS : area.id === 'river-market'
      ? DISTRICT_POPULATION_DEFINITIONS.filter(npc => area.npcIds.includes(npc.id)) : [];
    const npcs = !blockout && definitions.length ? tail.span('streaming.npcConstruction', () => createNpcPresentation(definitions)) : null;
    if (npcs) group.add(npcs.group);
    const ownedResources = new Set([...objectResources(group), ...extraResources]);
    for (const resource of ownedResources) if (resource instanceof Texture) resource.userData.streamingArea = area.id;
    releaseResources = resources.acquire(ownedResources);
    return {
      group, dispose, roofEnvelopes: market?.facts.roofEnvelopes ?? [],
      facts: { areaId: area.id, ruralAssets, market: market?.facts ?? null, npcIds: [...area.npcIds],
        shell: area.id === 'neighbor-shell' ? 'Bounded transition shell; no M6 polish, new NPCs or gameplay.' : null },
      update(state: GameState, reduced: boolean) {
        const environment = state.environment;
        const population = state.population.filter(npc => area.npcIds.includes(npc.id));
        npcs?.update(population, environment?.time ?? state.elapsed, state.player.position, reduced);
        const time = environment?.time ?? state.elapsed;
        const waterTime = reduced ? Math.floor(time * 15) / 15 : time;
        rural?.update(waterTime, environment?.wind, environment?.rain);
        market?.update(waterTime, environment?.wind, environment?.rain);
        if (environment) market?.updateEnvironment(environment);
      },
      npcStats: () => npcs?.stats() ?? null,
    };
  } catch (error) { dispose(); throw error; }
}
