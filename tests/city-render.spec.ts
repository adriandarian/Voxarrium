import { expect, test } from '@playwright/test';
import { BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, Object3D, Sprite, Texture } from 'three';
import { cityBridgeSpans, createCityPresentation } from '../src/render/city-blueprint';
import { createCityBlueprint } from '../src/simulation/city-blueprint';
import { createStreamingWorld } from '../src/simulation/streaming-world';
import type { CityBlueprint } from '../src/simulation/city-contracts';
import type { CourseSpec, GameState } from '../src/simulation/types';

function fixture(): CityBlueprint {
  return {
    id: 'm6-city-blueprint', seed: 104729,
    districts: [
      { id: 'rural', name: 'Accepted rural', role: 'rural edge', footprint: [{ x: -12, z: 12 }, { x: 12, z: 12 }, { x: 12, z: -12 }, { x: -12, z: -12 }],
        center: { x: 0, y: 4, z: 0 }, elevationBand: [0, 8], neighbors: ['citadel'], entrances: ['road'], waterAdjacency: ['channel'],
        landmarks: [], streamingPriority: 1, density: 'rural', acceptedArea: 'rural' },
      { id: 'citadel', name: 'Citadel', role: 'upper landmark', footprint: [{ x: 20, z: -35 }, { x: 50, z: -35 }, { x: 50, z: -60 }, { x: 20, z: -60 }],
        center: { x: 35, y: 50, z: -47 }, elevationBand: [50, 50], neighbors: ['rural'], entrances: ['road'], waterAdjacency: [],
        landmarks: ['keep'], streamingPriority: 0, density: 'monumental' },
    ],
    terrain: [{ id: 'city.terrain.citadel.0', color: 0x989b72,
      vertices: [20, 50, -35, 50, 50, -35, 50, 50, -60, 20, 50, -60], indices: [0, 1, 2, 0, 2, 3] }],
    roads: [{ id: 'road', kind: 'ramp', width: 4, districts: ['rural', 'citadel'],
      points: [{ x: 0, y: 4, z: -12 }, { x: 20, y: 22, z: -20 }, { x: 35, y: 50, z: -35 }] }],
    waterways: [{ id: 'channel', from: 'source', to: 'sea', width: 10, evidence: 'visible',
      points: [{ x: -20, y: -.2, z: 20 }, { x: -12, y: -.2, z: 2 }, { x: -18, y: -.2, z: -30 }] }],
    connections: [{ id: 'rural-citadel', from: 'rural', to: 'citadel', road: 'road', width: 4,
      points: [{ x: 0, y: 4, z: -12 }, { x: 35, y: 50, z: -35 }] }],
    landmarks: [{ id: 'keep', position: { x: 35, y: 58, z: -47 }, size: { x: 10, y: 16, z: 12 }, color: 0xbcb598, collides: true, rotationY: .3 }],
    massing: { rural: [], 'river-market': [], 'neighbor-shell': [], 'lower-canal': [], 'south-gate': [], 'garden-terrace': [],
      'central-market': [], 'west-bank': [], 'civic-terrace': [], 'noble-quarter': [], 'temple-quarter': [], 'upper-city': [], 'orchard-edge': [],
      citadel: [{ id: 'citadel.test-house', position: { x: 22, y: 53, z: -40 }, size: { x: 5, y: 6, z: 7 }, color: 0xc99166, rotationY: -.2, collides: true }] },
    cameras: [], route: [], assumptions: ['Rendering-data fixture only; not an actual city.'],
  };
}
function accepted(): CourseSpec {
  return { id: 'm2-rural-96m', seed: 104729, spawn: { x: 0, y: 4, z: 0 }, bookmarks: {}, labels: [],
    surfaces: [{ id: 'rural.exact', color: 0x8d9861, vertices: [-12, 4, -12, 12, 4, -12, 12, 4, 12, -12, 4, 12], indices: [0, 2, 1, 0, 3, 2] }],
    boxes: [{ id: 'accepted.cottage.collider', visible: false, collides: true, color: 0xcabb92,
      position: { x: 1.5, y: 6, z: -3 }, size: { x: 7, y: 4, z: 6 }, rotationY: .7 }] };
}
function state(mode: GameState['camera']['mode'] = 'third-person'): GameState {
  return { sceneId: 'm6-city-blueprint', seed: 104729, tick: 0, elapsed: 0, paused: false, resets: 0,
    player: { position: { x: 0, y: 4, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true, heading: 0 },
    camera: { mode, yaw: 0, pitch: 0, debugPosition: { x: 0, y: 80, z: 80 } }, environment: null, population: [], interaction: null };
}

test('city presentation preserves exact accepted geometry and deterministic world transforms', () => {
  const blueprint = fixture(), course = accepted(), before = structuredClone({ blueprint, course });
  const presentation = createCityPresentation(blueprint, [course]);
  const repeat = createCityPresentation(fixture(), [accepted()]);
  try {
    expect({ blueprint, course }).toEqual(before);
    const terrain = presentation.group.getObjectByName('city.overview.accepted-terrain.rural') as Mesh;
    expect(Array.from(terrain.geometry.getAttribute('position').array)).toEqual(course.surfaces![0]!.vertices);
    expect(Array.from(terrain.geometry.index!.array)).toEqual(course.surfaces![0]!.indices);
    const proxies = presentation.group.getObjectByName('city.overview.accepted-collider-masses.rural') as InstancedMesh;
    const actual = new Matrix4(); proxies.getMatrixAt(0, actual);
    const transform = new Object3D(), spec = course.boxes[0]!;
    transform.position.set(spec.position.x, spec.position.y, spec.position.z); transform.scale.set(spec.size.x, spec.size.y, spec.size.z);
    transform.rotation.y = spec.rotationY!; transform.updateMatrix();
    actual.elements.forEach((value, i) => expect(value).toBeCloseTo(transform.matrix.elements[i]!, 5));
    const other = repeat.group.getObjectByName(proxies.name) as InstancedMesh;
    expect(Array.from(proxies.instanceMatrix.array)).toEqual(Array.from(other.instanceMatrix.array));
    const side = presentation.group.getObjectByName('city.terrain.retaining-sides') as Mesh;
    expect(side.geometry.index!.count).toBe(24); // Four full side faces, not a camera-facing facade.
    expect(side.geometry.boundingBox!.min.y).toBe(-3); expect(side.geometry.boundingBox!.max.y).toBe(50);
    presentation.group.traverse(object => {
      if (object instanceof Mesh) expect(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    });
  } finally { presentation.dispose(); repeat.dispose(); }
});

test('gameplay retains terrain and landmarks while overview proxies omit active areas without rebuilding', () => {
  const presentation = createCityPresentation(fixture(), [accepted()]);
  try {
    const resources = presentation.stats().resources;
    expect(presentation.stats().massingInstances).toBe(1); expect(presentation.stats().acceptedProxyInstances).toBe(1);
    for (let i = 0; i < 50; i++) {
      presentation.update(state('eagle-eye'), ['rural']);
      expect(presentation.stats().overviewDistricts).toEqual(['citadel']);
      presentation.update(state('first-person'), ['rural']);
      expect(presentation.stats().overviewVisible).toBe(false);
      expect(presentation.group.getObjectByName('city.landmark.masses')!.visible).toBe(true);
      expect(presentation.group.getObjectByName('city.terrain.tops')!.visible).toBe(true);
    }
    expect(presentation.stats().resources).toEqual(resources);
    expect(presentation.group.getObjectByName('city.debug.districts')!.visible).toBe(false);
    presentation.setDebug('roads'); expect(presentation.group.getObjectByName('city.debug.roads')!.visible).toBe(true);
    presentation.setDebug('elevation'); expect(presentation.group.getObjectByName('city.debug.roads')!.visible).toBe(false);
    expect(presentation.group.getObjectByName('city.debug.elevation')!.visible).toBe(true);
    presentation.setDebug('none'); expect(presentation.stats().debugLayer).toBe('none');
    expect(presentation.stats().resources).toEqual(resources);
  } finally { presentation.dispose(); }
});

test('city disposal releases shared geometry, materials and instance buffers once and reports zero ownership', () => {
  const presentation = createCityPresentation(fixture(), [accepted()]);
  const tracked = new Set<BufferGeometry | Material | Texture | InstancedMesh>();
  presentation.group.traverse(object => {
    if (object instanceof InstancedMesh) tracked.add(object);
    if (object instanceof Mesh) tracked.add(object.geometry);
    if (object instanceof Mesh || object instanceof Sprite) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        tracked.add(material); for (const value of Object.values(material)) if (value instanceof Texture) tracked.add(value);
      }
    }
  });
  const counts = new Map([...tracked].map(resource => [resource, 0]));
  for (const resource of tracked) {
    const events = resource as { addEventListener(type: 'dispose', listener: () => void): void };
    events.addEventListener('dispose', () => { counts.set(resource, counts.get(resource)! + 1); });
  }
  presentation.dispose(); presentation.dispose();
  expect([...counts.values()].every(count => count === 1)).toBe(true);
  expect(presentation.stats()).toMatchObject({ disposed: true, visibleDrawObjects: 0, visibleTriangles: 0,
    resources: { geometries: 0, materials: 0, textures: 0, instanceBuffers: 0 } });
  presentation.update(state('eagle-eye'), []); presentation.setDebug('districts');
  expect(presentation.group.children).toHaveLength(0);
});

test('bridge structures cover the water span and leave both land approaches open', () => {
  const blueprint = fixture();
  blueprint.waterways = [{ id: 'channel', from: 'source', to: 'sea', width: 10, evidence: 'visible',
    points: [{ x: 0, y: -1.16, z: -30 }, { x: 0, y: -1.16, z: 0 }, { x: 0, y: -1.16, z: 30 }] }];
  blueprint.roads = [{ id: 'crossing', kind: 'bridge', width: 6, districts: ['rural', 'citadel'], points: [
    { x: -30, y: 12, z: -10 }, { x: -15, y: 12, z: -10 }, { x: 15, y: 12, z: -10 }, { x: 30, y: 12, z: -10 },
  ] }];
  const spans = cityBridgeSpans(blueprint);
  expect(spans).toHaveLength(1); expect(spans[0]!.segment).toBe(2);
  expect(spans[0]!.a.x).toBeCloseTo(-6.1, 6); expect(spans[0]!.b.x).toBeCloseTo(6.1, 6);
  const presentation = createCityPresentation(blueprint, []);
  try {
    const mesh = presentation.group.getObjectByName('city.bridge.deck-parapets-piers') as InstancedMesh;
    expect(mesh.count).toBe(5); expect(presentation.stats().bridgeSpans).toBe(1);
    const transform = new Matrix4(); mesh.getMatrixAt(0, transform);
    expect(Math.hypot(transform.elements[8]!, transform.elements[9]!, transform.elements[10]!)).toBeCloseTo(12.2, 5);
  } finally { presentation.dispose(); }
});

test('stair treads preserve the smooth authoring path and capped landmarks have full 3D geometry', () => {
  const blueprint = fixture(); blueprint.roads[0]!.kind = 'stairs';
  blueprint.roads[0]!.points = [{ x: 0, y: 4, z: 0 }, { x: 0, y: 5.36, z: -8 }];
  blueprint.landmarks[0]!.id = 'citadel-tower';
  const before = structuredClone(blueprint), presentation = createCityPresentation(blueprint, []);
  try {
    expect(blueprint).toEqual(before);
    const treads = presentation.group.getObjectByName('city.circulation.stair-treads') as InstancedMesh;
    expect(treads.count).toBe(8); expect(presentation.stats().stairTreads).toBe(8);
    const previous = new Matrix4(), next = new Matrix4();
    for (let i = 1; i < treads.count; i++) {
      treads.getMatrixAt(i - 1, previous); treads.getMatrixAt(i, next);
      expect(Math.abs(next.elements[13]! - previous.elements[13]!)).toBeLessThanOrEqual(.180001);
    }
    const cap = presentation.group.getObjectByName('city.landmark.octagonal-cap-silhouettes') as InstancedMesh;
    expect(cap.count).toBe(1); expect(cap.geometry.getAttribute('position').count).toBeGreaterThan(8);
    expect(presentation.group.getObjectByName('city.landmark.finials')).toBeTruthy();
    expect(presentation.stats().landmarkCapInstances).toBe(1);
  } finally { presentation.dispose(); }
});

test('actual full blueprint stays a bounded proxy inventory with coherent finite geometry', async () => {
  const blueprint = createCityBlueprint(), acceptedWorld = createStreamingWorld();
  const presentation = createCityPresentation(blueprint, acceptedWorld.areas.map(area => area.course));
  try {
    presentation.update(state('eagle-eye'), []);
    const facts = presentation.stats();
    // These generous regression limits apply to this authored proxy fixture, not production assets.
    expect(facts.districts).toBe(14); expect(facts.resources.geometries).toBeLessThan(64);
    expect(facts.resources.instanceBuffers).toBeLessThan(32); expect(facts.visibleDrawObjects).toBeLessThan(64);
    expect(facts.visibleTriangles).toBeLessThan(100_000); expect(facts.resources.textures).toBe(0);
    presentation.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const vertices = object.geometry.getAttribute('position');
      expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
      if (object instanceof InstancedMesh) expect(Array.from(object.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    });
    await test.info().attach('actual-city-proxy-inventory.json', { body: JSON.stringify(facts, null, 2), contentType: 'application/json' });
    console.info('Authored city proxy inventory:', JSON.stringify(facts));
    console.info('Water-crossing bridge spans:', JSON.stringify(cityBridgeSpans(blueprint)));
  } finally { presentation.dispose(); }
});
