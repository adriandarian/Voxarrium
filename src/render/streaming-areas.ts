import {
  BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh,
  Material, Mesh, MeshStandardMaterial, Sprite, Texture,
} from 'three';
import type { Object3D } from 'three';
import type { WorldArea } from '../simulation/streaming-contracts';
import type { GameState } from '../simulation/types';
import { NPC_DEFINITIONS, DISTRICT_POPULATION_DEFINITIONS } from '../simulation/npcs';
import { loadRuralAssets } from '../assets/rural';
import { ruralEnvironmentJobs, LANES } from './rural';
import { createDistrictPresentation } from './district';
import { npcPresentationJobs } from './npcs';
import { landscapeMaterialJobs, terrainPigmentJobs, applyLandscapeUV } from './landscape-materials';
import { ResourceReferences, AssetReferences } from '../assets/resource-references';
import { tail } from '../diagnostics/tail';
import { PreparationScheduler } from './preparation-scheduler';
import type { PreparationWorkEvent } from './preparation-scheduler';
import type { PreparationCache, PreparationResources } from './preparation-cache';
import type { TransitionHandle } from '../diagnostics/transition';

export interface AreaPreparationOptions {
  cache?: PreparationCache;
  transition?: TransitionHandle;
  onPhase?: (phase: 'preparing', detail: Record<string, unknown>) => void;
  onWork?: (event: PreparationWorkEvent) => void;
}

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
  resources: ResourceReferences, assets: AssetReferences, options: AreaPreparationOptions = {}) {
  throwIfAborted(signal);
  const group = new Group(); group.name = `streaming.area.${area.id}`;
  const leases = new Map<Disposable, () => void>();
  const scope: PreparationResources = {
    cache: options.cache,
    transition: options.transition,
    own<T extends Disposable>(resource: T): T {
      if (!leases.has(resource)) leases.set(resource, resources.acquire([resource]));
      return resource;
    },
    release(resource) { const release = leases.get(resource); if (release) { leases.delete(resource); release(); } },
  };
  const releaseAssets = assets.acquire(area.assetIds);
  let released = false;
  const scheduler = new PreparationScheduler(signal, { onWork(work) { options.transition?.work(work); options.onWork?.(work); } });
  options.onPhase?.('preparing', { areaId: area.id, budgetMs: scheduler.budgetMs });
  options.transition?.event('object-construction-begin', { areaId: area.id });
  function dispose() {
    if (released) return; released = true;
    group.removeFromParent();
    const failures: unknown[] = [];
    // Includes partial subgroups, originals restored by environment hooks, and off-scene helpers.
    for (const resource of objectResources(group)) if (!leases.has(resource)) {
      try { scope.own(resource); } catch (error) { failures.push(error); }
    }
    for (const release of leases.values()) { try { release(); } catch (error) { failures.push(error); } }
    leases.clear(); group.clear(); releaseAssets();
    if (failures.length) throw new AggregateError(failures, 'Partial area disposal failed.');
  }
  try {
    const createBox = () => new BoxGeometry(1, 1, 1);
    const boxGeometry = scope.own(options.transition ? options.transition.span('geometry-creation', createBox) : createBox());
    const materials = new Map<number, MeshStandardMaterial>();
    await scheduler.run('area.static-boxes', (function* () {
    for (const box of area.course.boxes) {
      if (box.visible === false) continue;
      if (!blockout && (box.id.startsWith('district.stairs.') || /^stairs\.(main|crop)\.\d+$/.test(box.id))) continue;
      let material = materials.get(box.color);
      if (!material) {
        const createMaterial = () => new MeshStandardMaterial({ color: box.color, roughness: .92 });
        material = scope.own(options.transition ? options.transition.span('material-creation', createMaterial) : createMaterial()); materials.set(box.color, material);
      }
      const mesh = new Mesh(boxGeometry, material); mesh.name = box.id;
      mesh.position.set(box.position.x, box.position.y, box.position.z);
      mesh.scale.set(box.size.x, box.size.y, box.size.z);
      mesh.rotation.set(box.rotationX ?? 0, box.rotationY ?? 0, 0);
      mesh.receiveShadow = true; mesh.castShadow = box.collides && Math.max(box.size.x, box.size.z) < 40;
      group.add(mesh); yield 'area.static-box';
    }
    })());
    const landscape = !blockout && (area.id === 'rural' || area.id === 'river-market')
      ? await scheduler.run('area.landscape-materials', landscapeMaterialJobs(scope)) : null;
    if (landscape) for (const material of Object.values(landscape)) {
      if (material === landscape.stone || material === landscape.soil) material.vertexColors = true;
    }
    await tail.asyncSpan('streaming.terrainConstruction', () => scheduler.run('area.terrain', (function* () {
      for (const surface of area.course.surfaces ?? []) {
        const key = `terrain.${area.id}.${surface.id}`;
        const lookup = () => options.cache?.get<BufferGeometry>(key);
        let geometry = options.transition ? options.transition.span('geometry-lookup-reuse', lookup, { key }) : lookup();
        const market = surface.id.startsWith('district.');
        const cliff = surface.id.endsWith('.cliff') || surface.id.endsWith('.edge');
        if (!geometry) {
          geometry = scope.own(new BufferGeometry());
          geometry.setAttribute('position', new Float32BufferAttribute(surface.vertices, 3));
          geometry.setIndex(surface.indices); geometry.computeVertexNormals();
          if (landscape) {
            geometry = yield* terrainPigmentJobs(geometry, area.course, LANES, cliff, surface.id.endsWith('.shore'), scope);
            applyLandscapeUV(geometry, cliff ? 'cliff' : 'ground');
          }
          // The three fixed area definitions bound this cache; collision/source attributes are untouched.
          options.cache?.retain(key, geometry, [geometry]);
        }
        scope.own(geometry);
        const material = landscape ? (cliff || market ? landscape.stone : surface.id.endsWith('.shore') ? landscape.soil : landscape.grass)
          : scope.own(new MeshStandardMaterial({ color: surface.color, roughness: 1 }));
        const mesh = new Mesh(geometry, material); mesh.name = surface.id;
        mesh.receiveShadow = true; mesh.castShadow = true;
        if (!blockout && surface.id.endsWith('.shore')) mesh.visible = false;
        group.add(mesh); yield 'area.terrain-surface';
      }
    })()));
    throwIfAborted(signal);
    const ruralTarget = new Group();
    if (area.id === 'rural') group.add(ruralTarget);
    const rural = area.id === 'rural' ? await tail.asyncSpan('streaming.ruralConstruction', () =>
      scheduler.run('rural.construction', ruralEnvironmentJobs(area.course, blockout, scope, ruralTarget))) : null;
    const ruralAssets = rural && !blockout ? await tail.asyncSpan('streaming.ruralAssets', () => loadRuralAssets(rural.group, signal, scheduler, scope)) : [];
    throwIfAborted(signal);
    const marketTarget = new Group();
    if (area.id === 'river-market' && !blockout) group.add(marketTarget);
    const market = area.id === 'river-market' && !blockout
      ? await tail.asyncSpan('streaming.marketConstruction', () => createDistrictPresentation(area.course, signal, scheduler, scope, marketTarget)) : null;
    throwIfAborted(signal);
    const definitions = area.id === 'rural' ? NPC_DEFINITIONS : area.id === 'river-market'
      ? DISTRICT_POPULATION_DEFINITIONS.filter(npc => area.npcIds.includes(npc.id)) : [];
    const npcs = !blockout && definitions.length ? await tail.asyncSpan('streaming.npcConstruction', () =>
      scheduler.run('area.npc-figures', npcPresentationJobs(definitions, scope))) : null;
    if (npcs) group.add(npcs.group);
    for (const resource of objectResources(group)) {
      scope.own(resource);
      if (resource instanceof Texture) resource.userData.streamingArea ??= area.id;
    }
    options.transition?.event('object-construction-complete', { scheduler: scheduler.snapshot(), cache: options.cache?.snapshot() });
    return {
      group, dispose, schedulerStats: scheduler.snapshot(), cacheStats: () => options.cache?.snapshot() ?? null, roofEnvelopes: market?.facts.roofEnvelopes ?? [],
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
