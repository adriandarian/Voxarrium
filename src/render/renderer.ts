import {
  ACESFilmicToneMapping, BoxGeometry, BufferGeometry, CanvasTexture, Float32BufferAttribute, InstancedMesh,
  CapsuleGeometry, Color, DirectionalLight, Group, HemisphereLight, Material,
  Mesh, MeshStandardMaterial, PCFShadowMap, Scene, SphereGeometry, Sprite,
  SpriteMaterial, SRGBColorSpace, Texture, Vector2, Vector3, REVISION, RenderTarget, HalfFloatType, LinearSRGBColorSpace,
} from 'three';
import type { Object3D, PerspectiveCamera } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { loadScaleFixture } from '../assets/fixture';
import { loadRuralAssets } from '../assets/rural';
import { createRuralEnvironment, LANES } from './rural';
import { applyLandscapeUV, applyTerrainPigment, createLandscapeMaterials } from './landscape-materials';
import { PLAYER } from '../simulation/types';
import type { CourseSpec, GameState } from '../simulation/types';
import { createEnvironmentPresentation } from './environment';
import { createNpcPresentation } from './npcs';
import { createDistrictPresentation } from './district';
import { createRuralCourse } from '../simulation/rural';
import { DISTRICT_POPULATION_DEFINITIONS, NPC_DEFINITIONS } from '../simulation/npcs';
import { tail } from '../diagnostics/tail';
import { ResourceReferences, AssetReferences } from '../assets/resource-references';
import { createAreaPresentation, throwIfAborted } from './streaming-areas';
import type { WorldArea } from '../simulation/streaming-contracts';
import { PreparationScheduler } from './preparation-scheduler';
import { PreparationCache } from './preparation-cache';
import { compileArea } from './area-compilation';
import {withResidentMeshesHidden} from './warmup-visibility';
import { installScheduledNodeBuilds } from './scheduled-node-builds';
import type { ScheduledNodeBackend } from './scheduled-node-builds';
import { installPipelineCache } from './pipeline-cache';
import { installInstanceBufferNames } from './instance-buffer-names';
import type { InstanceUniformBackend } from './instance-buffer-names';
import type { PipelineManager } from './pipeline-cache';
import { createCityPresentation } from './city-blueprint';
import type { CityDebugLayer } from './city-blueprint';
import type { CityBlueprint } from '../simulation/city-contracts';
import type { CitadelSpec } from '../simulation/citadel-contracts';
import { installScopedRenderBindings } from './shared-render-bindings';
import type { BindingBackend } from './shared-render-bindings';
import { loadCitadelSkyline } from '../assets/citadel';
import type { PreparationResources } from './preparation-cache';

// Runtime backends expose these fields in the installed Three.js r186 source;
// @types/three deliberately omits device/gl internals. Read only for diagnostics.
interface BackendDiagnostics {
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
  device?: {
    adapterInfo?: { vendor?: string; architecture?: string; device?: string; description?: string };
    queue: { onSubmittedWorkDone(): Promise<void> };
  };
  gl?: WebGL2RenderingContext;
}
interface BackendCpuHooks {
  updateTexture(...args: unknown[]): void;
  createRenderPipeline(...args: unknown[]): void;
}
interface TextureInfoHooks {
  createTexture(texture: Texture): void;
  destroyTexture(texture: Texture): void;
}

function backendDetails(renderer: WebGPURenderer) {
  const backend = renderer.backend as typeof renderer.backend & BackendDiagnostics;
  if (backend.isWebGPUBackend) {
    const info = backend.device?.adapterInfo;
    return {
      backend: 'WebGPU' as const,
      adapter: info ? { vendor: info.vendor ?? '', architecture: info.architecture ?? '', device: info.device ?? '', description: info.description ?? '' } : null,
      adapterInfoSource: info ? 'initialized GPUDevice.adapterInfo' : 'not exposed by initialized device',
    };
  }
  if (backend.isWebGLBackend && backend.gl) {
    const gl = backend.gl;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      backend: 'WebGL2' as const,
      adapter: {
        vendor: String(gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
        description: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
        architecture: '', device: '',
      },
      adapterInfoSource: debug ? 'initialized WebGL2 debug renderer info' : 'initialized WebGL2 vendor/renderer',
    };
  }
  throw new Error('Three.js initialized an unknown backend; runtime backend identification failed.');
}

function createLabel(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the course label canvas.');
  context.fillStyle = '#203735';
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 14);
  context.fill();
  context.fillStyle = '#e5b673';
  context.fillRect(20, 22, 5, 52);
  context.font = '500 34px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f0f0e6';
  context.fillText(text, 334, 49, 580);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }));
  sprite.name = `label:${text}`;
  sprite.scale.set(3.7, 0.555, 1);
  return sprite;
}

function createPlayer() {
  const player = new Group();
  player.name = 'player.diagnostic-avatar';
  const body = new Mesh(new CapsuleGeometry(PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 6, 12), new MeshStandardMaterial({ color: 0x247871, roughness: 0.9 }));
  body.position.y = PLAYER.height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  player.add(body);
  const face = new Mesh(new SphereGeometry(0.12, 10, 8), new MeshStandardMaterial({ color: 0xe9c896, roughness: 0.85 }));
  face.scale.set(1.4, 0.72, 0.4);
  face.position.set(0, 1.46, -0.272);
  player.add(face);
  return player;
}

function disposeScene(scene: Scene) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  scene.traverse(object => {
    if (object instanceof DirectionalLight) object.shadow.dispose();
    if (object instanceof InstancedMesh) object.dispose();
    if (object instanceof Mesh || object instanceof Sprite) {
      if (object instanceof Mesh) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      }
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  scene.clear();
}

export async function createGameRenderer(canvas: HTMLCanvasElement, course: CourseSpec, forceWebGL: boolean, blockout = false,
  city?: { blueprint: CityBlueprint; acceptedCourses: CourseSpec[];replacedLandmarks?:string[];core?:boolean;upper?:boolean;citadel?:CitadelSpec|null;urban?:import('../simulation/urban-contracts').UrbanDistrict[] }) {
  const streaming = course.id === 'm5-streaming-proof' || !!city;
  const district = course.id === 'm4-market-district' || streaming;
  const rural = course.id === 'm2-rural-96m' || district;
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false, forceWebGL, powerPreference: 'high-performance' });
  const scene = new Scene();
  scene.name = course.id;
  scene.background = new Color(0xc8dae1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.info.autoReset = false;
  // Installed r186 Info exposes these accounting callbacks. Keep metadata only;
  // this diagnostic inventory never holds the texture or changes its ownership.
  const textureInventory = new Map<number, { id: number; area: string | null; createdMs: number; name: string; type: string; width: number | null; height: number | null; target: boolean }>();
  const textureEvents: { id: number; event: string; area: unknown; name: string; time: number; stack?: string }[] = [];
  const destroyedTextures = new WeakSet<Texture>();
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1') {
    const info = renderer.info as typeof renderer.info & TextureInfoHooks;
    const create = info.createTexture.bind(info), destroy = info.destroyTexture.bind(info);
    info.createTexture = texture => {
      create(texture);
      textureEvents.push({ id: texture.id, event: destroyedTextures.has(texture) ? 'recreated' : 'created', area: texture.userData.streamingArea ?? null, name: texture.name, time: performance.now(),
        ...(destroyedTextures.has(texture) ? { stack: new Error().stack?.slice(0, 2500) } : {}) });
      if (textureEvents.length > 256) textureEvents.shift();
      const image = texture.image as { width?: number; height?: number } | undefined;
      textureInventory.set(texture.id, { id: texture.id, area: typeof texture.userData.streamingArea === 'string' ? texture.userData.streamingArea : null, createdMs: performance.now(), name: texture.name, type: texture.constructor.name,
        width: image?.width ?? null, height: image?.height ?? null, target: texture.isRenderTargetTexture });
    };
    info.destroyTexture = texture => {
      textureEvents.push({ id: texture.id, event: 'destroyed', area: texture.userData.streamingArea ?? null, name: texture.name, time: performance.now() });
      if (textureEvents.length > 256) textureEvents.shift();
      destroyedTextures.add(texture); textureInventory.delete(texture.id); destroy(texture);
    };
  }

  let primaryStartupError: string | null = null;
  let rendererInitialized = false;
  let livingEnvironment: ReturnType<typeof createEnvironmentPresentation> | null = null;
  let cityPresentation: ReturnType<typeof createCityPresentation> | null = null;
  const resourceReferences = new ResourceReferences();
  const assetReferences = new AssetReferences();
  const preparationCache = new PreparationCache(resourceReferences);
  const skylineLeases=new Map<{dispose():void},()=>void>();let releaseSkylineAsset:(()=>void)|null=null;
  const skylineScope:PreparationResources={cache:preparationCache,
    own<T extends {dispose():void}>(resource:T):T{if(!skylineLeases.has(resource))skylineLeases.set(resource,resourceReferences.acquire([resource]));return resource;},
    release(resource){const release=skylineLeases.get(resource);if(release){skylineLeases.delete(resource);release();}}};
  function releaseSkyline(){for(const release of skylineLeases.values())release();skylineLeases.clear();releaseSkylineAsset?.();releaseSkylineAsset=null;}
  // Match r186's linear HDR scene buffer formats and samples. Size is not a
  // pipeline key. Warmup never presents an incomplete destination on the canvas.
  const warmupTarget = new RenderTarget(4, 4, { type: HalfFloatType, samples: renderer.samples, colorSpace: LinearSRGBColorSpace });
  const areaPresentations = new Map<string, Awaited<ReturnType<typeof createAreaPresentation>>>();
  const activeAreas = new Set<string>();
  const firstFrames = new Map<string, ReturnType<typeof tail.beginTransition>>();
  const keyedTransientMaterials = new WeakSet<Material>();
  const scheduledNodeObjects = new WeakMap<Object3D, () => PreparationScheduler>();
  let restoreScheduledNodeBuilds: (() => void) | null = null;
  let restoreInstanceBufferNames: (() => void) | null = null;
  const pipelineCacheObjects = new WeakMap<Object3D, string>();
  const instanceBufferObjects = new WeakMap<Object3D, string>();
  let pipelineCache: ReturnType<typeof installPipelineCache> | null = null;
  // Preserve the native fallback, but record the failure that triggered it.
  const primaryBackend = renderer.backend;
  const initializeBackend = primaryBackend.init.bind(primaryBackend);
  primaryBackend.init = async activeRenderer => {
    try { await initializeBackend(activeRenderer); }
    catch (error) { primaryStartupError = String(error); throw error; }
  };

  try {
    await tail.asyncSpan('renderer.backendInit', () => renderer.init());
    rendererInitialized = true;
    if (streaming) installScopedRenderBindings(renderer.backend as unknown as BindingBackend);
    if (city?.core) restoreScheduledNodeBuilds = installScheduledNodeBuilds(
      renderer.backend as unknown as ScheduledNodeBackend, scheduledNodeObjects);
    if (city?.core && (renderer.backend as typeof renderer.backend & BackendDiagnostics).isWebGPUBackend) {
      pipelineCache = installPipelineCache((renderer as unknown as { _pipelines: PipelineManager })._pipelines, pipelineCacheObjects);
      restoreInstanceBufferNames = installInstanceBufferNames(renderer.backend as unknown as InstanceUniformBackend, instanceBufferObjects);
    }
    const initialized = backendDetails(renderer);
    // CPU entry-point wall durations only. Neither uploads nor queue waits are
    // GPU timestamps. The wrappers preserve the installed backend's arguments.
    const activeBackend = renderer.backend as typeof renderer.backend & BackendCpuHooks;
    const upload = activeBackend.updateTexture.bind(activeBackend);
    activeBackend.updateTexture = (...args) => tail.span('renderer.textureUploadCpu', () => upload(...args));
    const pipeline = activeBackend.createRenderPipeline.bind(activeBackend);
    activeBackend.createRenderPipeline = (...args) => tail.span('renderer.pipelineCreateCpu', () => pipeline(...args));
    const sun = new DirectionalLight(0xffedcc, 3.0);
    sun.name = 'lighting.sun';
    sun.position.set(-24, 38, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42;
    sun.shadow.camera.bottom = -42;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00008;
    if (rural) {
      sun.intensity = 2.75;
      sun.position.set(-30, 65, 24);
      sun.shadow.mapSize.set(4096, 4096);
      sun.shadow.camera.left = -65; sun.shadow.camera.right = 65;
      sun.shadow.camera.top = 65; sun.shadow.camera.bottom = -65;
      sun.shadow.camera.far = 160;
    }
    const fill = new HemisphereLight(rural ? 0xf0efe0 : 0xe4f0ff, rural ? 0x797f61 : 0x69745a, rural ? 1.85 : 1.65);
    scene.add(sun, fill);
    if (district) {
      sun.target.position.set(50, 0, 0); scene.add(sun.target);
      sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
      sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
      sun.shadow.camera.far = 300;
    }
    if (city) {
      cityPresentation = createCityPresentation(city.blueprint, city.acceptedCourses,city.replacedLandmarks,city.core?city.urban:undefined,city.citadel);
      if(city.citadel&&!blockout){
        releaseSkylineAsset=assetReferences.acquire(['citadel.skyline']);
        const signal=new AbortController().signal;
        const skyline=await loadCitadelSkyline(signal,new PreparationScheduler(signal),skylineScope);
        skyline.root.position.set(city.citadel.position.x,city.citadel.position.y,city.citadel.position.z);
        skyline.root.name='citadel.skyline';skyline.root.traverse(o=>{if(o instanceof Mesh){o.name=`citadel.skyline.${o.name}`;o.castShadow=true;o.receiveShadow=true;}});
        cityPresentation.setCitadelSkyline(skyline.root);
      }
      scene.add(cityPresentation.group);
    }

    const boxGeometry = new BoxGeometry(1, 1, 1);
    const materials = new Map<number, MeshStandardMaterial>();
    if (streaming) boxGeometry.dispose();
    for (const box of streaming ? [] : course.boxes) {
      if (box.visible === false) continue;
      if (district && !blockout && box.id.startsWith('district.stairs.')) continue;
      if (rural && !blockout && /^stairs\.(main|crop)\.\d+$/.test(box.id)) continue;
      if (!materials.has(box.color)) materials.set(box.color, new MeshStandardMaterial({ color: box.color, roughness: 0.92, metalness: 0 }));
      const mesh = new Mesh(boxGeometry, materials.get(box.color));
      mesh.name = box.id;
      mesh.position.set(box.position.x, box.position.y, box.position.z);
      mesh.scale.set(box.size.x, box.size.y, box.size.z);
      mesh.rotation.set(box.rotationX ?? 0, box.rotationY ?? 0, box.rotationZ ?? 0);
      mesh.receiveShadow = true;
      mesh.castShadow = box.collides && Math.max(box.size.x, box.size.z) < 40;
      scene.add(mesh);
    }
    const landscapeMaterials = rural && !streaming && !blockout ? createLandscapeMaterials() : null;
    if (landscapeMaterials) {
      landscapeMaterials.stone.vertexColors = true;
      landscapeMaterials.soil.vertexColors = true;
    }
    for (const surface of streaming ? [] : course.surfaces ?? []) {
      let geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(surface.vertices, 3));
      geometry.setIndex(surface.indices); geometry.computeVertexNormals();
      const districtSurface = surface.id.startsWith('district.');
      const cliff = surface.id.endsWith('.cliff') || surface.id.endsWith('.edge');
      if (landscapeMaterials) {
        geometry = applyTerrainPigment(geometry, course, LANES, cliff, surface.id.endsWith('.shore'));
        applyLandscapeUV(geometry, cliff ? 'cliff' : 'ground');
      }
      const mesh = new Mesh(geometry, landscapeMaterials ? (cliff || districtSurface ? landscapeMaterials.stone : surface.id.endsWith('.shore') ? landscapeMaterials.soil : landscapeMaterials.grass)
        : new MeshStandardMaterial({ color: surface.color, roughness: 1 }));
      mesh.name = surface.id; mesh.receiveShadow = true; mesh.castShadow = true;
      if (rural && !blockout && surface.id.endsWith('.shore')) mesh.visible = false;
      scene.add(mesh);
    }
    const environment = rural && !streaming ? tail.span('world.ruralConstruction', () => createRuralEnvironment(district ? createRuralCourse() : course, blockout)) : null;
    if (environment) scene.add(environment.group);
    const ruralAssets = environment && !blockout ? await tail.asyncSpan('assets.ruralLoad', () => loadRuralAssets(environment.group)) : [];
    const districtPresentation = district && !streaming && !blockout ? await tail.asyncSpan('world.districtLoadAndConstruction', () => createDistrictPresentation(course)) : null;
    if (districtPresentation) scene.add(districtPresentation.group);
    const labels = course.labels.map(label => {
      const sprite = createLabel(label.text);
      sprite.position.set(label.position.x, label.position.y + 0.42, label.position.z);
      scene.add(sprite);
      return sprite;
    });
    const player = createPlayer();
    scene.add(player);
    const fixture = await tail.asyncSpan('assets.calibrationLoad', loadScaleFixture);
    fixture.object.visible = !rural;
    scene.add(fixture.object);
    const locals = rural && !streaming && !blockout ? createNpcPresentation(district ? DISTRICT_POPULATION_DEFINITIONS : NPC_DEFINITIONS) : null;
    if (locals) scene.add(locals.group);
    if (rural && !blockout) livingEnvironment = createEnvironmentPresentation(scene, sun, fill, course, districtPresentation?.facts.roofEnvelopes,city?.upper?city.blueprint:undefined);
    const facts = {
      threeRevision: REVISION,
      requestedBackend: forceWebGL ? 'WebGL2 (explicit fallback test)' : 'WebGPU preferred',
      ...initialized,
      gpu: initialized.adapter,
      fallbackOccurred: !forceWebGL && initialized.backend === 'WebGL2',
      fallbackReason: !forceWebGL && initialized.backend === 'WebGL2' ? `WebGPU initialization failed: ${primaryStartupError ?? 'backend did not provide a reason'}` : null,
      primaryStartupError,
      navigatorGpuPresent: 'gpu' in navigator && !!navigator.gpu,
      secureContext: window.isSecureContext,
      browser: navigator.userAgent,
      fixture: fixture.facts,
      ruralAssets,
      district: districtPresentation?.facts ?? null,
      loadedAssetCount: 1 + ruralAssets.length + (districtPresentation ? 1 : 0),
      environment: environment ? structuredClone(environment.group.userData) : null,
      assetReady: true,
      shadersReady: false,
      gpuTiming: 'not measured',
      errors: [] as string[],
    };
    let disposed = false;
    let fatalError: Error | null = null;
    renderer.onDeviceLost = info => {
      if (disposed) return;
      fatalError = new Error(`${info.api} device lost: ${info.reason ?? 'unknown'}; ${info.message}`);
      facts.errors.push(fatalError.message);
      console.error(fatalError);
    };
    (renderer as WebGPURenderer & { onError: (error: unknown) => void }).onError = error => {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
      fatalError = new Error(`Renderer backend error: ${message}`);
      facts.errors.push(fatalError.message);
      console.error(fatalError);
    };
    const size = new Vector2();
    const cameraPosition = new Vector3();
    function resize() {
      if (disposed) return;
      const width = Math.max(1, canvas.clientWidth || window.innerWidth);
      const height = Math.max(1, canvas.clientHeight || window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
    }
    function sync(state: GameState, camera: PerspectiveCamera) {
      player.position.set(state.player.position.x, state.player.position.y, state.player.position.z);
      player.rotation.y = state.player.heading;
      camera.getWorldPosition(cameraPosition);
      // Retracting the boom against a wall can put the camera inside the avatar.
      // Hide only the diagnostic avatar in that tight space; keep the world intact.
      const avatarEye = new Vector3(player.position.x, player.position.y + 1.43, player.position.z);
      player.visible = state.camera.mode !== 'first-person' &&
        !(state.camera.mode === 'third-person' && cameraPosition.distanceToSquared(avatarEye) < 0.95 ** 2);
      for (const label of labels) label.visible = state.camera.mode === 'eagle-eye' || cameraPosition.distanceToSquared(label.position) < 24 * 24;
    }
    let lastWaterUpdate = -1;
    let statePopulationCount = 0;
    function render(camera: PerspectiveCamera, state: GameState, reduced = false) {
      if (disposed) throw new Error('Cannot render after renderer disposal.');
      if (fatalError) throw fatalError;
      sync(state, camera);
      statePopulationCount = state.population.length;
      if (state.environment) {
        livingEnvironment?.update(state.environment, state.player.position, reduced);
        locals?.update(state.population, state.environment.time, state.player.position, reduced);
        districtPresentation?.updateEnvironment(state.environment);
      }
      if (city) {
        const overview = state.camera.mode === 'eagle-eye';
        const target = overview ? { x: 150, y: 20, z: -320 } : state.player.position;
        sun.target.position.set(target.x, target.y, target.z);
        const source = state.environment?.lighting.sunPosition ?? { x: -30, y: 65, z: 24 };
        sun.position.set(target.x + source.x * (overview ? 12 : 1), target.y + source.y * (overview ? 12 : 1), target.z + source.z * (overview ? 12 : 1));
        const extent = overview ? 500 : 65;
        sun.shadow.camera.left = -extent; sun.shadow.camera.right = extent;
        sun.shadow.camera.top = extent; sun.shadow.camera.bottom = -extent;
        sun.shadow.camera.far = overview ? 1800 : 300; sun.shadow.camera.updateProjectionMatrix();
        cityPresentation?.update(state, [...activeAreas]);
      }
      for (const [id, presentation] of areaPresentations) if (activeAreas.has(id)) presentation.update(state, reduced);
      const waterTime = state.environment?.time ?? state.elapsed;
      const waterUpdate = reduced ? Math.floor(waterTime * 15) / 15 : waterTime;
      if (waterUpdate !== lastWaterUpdate) {
        environment?.update(waterUpdate, state.environment?.wind, state.environment?.rain);
        districtPresentation?.update(waterUpdate, state.environment?.wind, state.environment?.rain);
        lastWaterUpdate = waterUpdate;
      }
      renderer.info.reset();
      const previousRenderObject = renderer.getRenderObjectFunction();
      const visibleAreas = new Set<string>();
      if (firstFrames.size) renderer.setRenderObjectFunction((...args: Parameters<typeof renderer.renderObject>) => {
        if (args[2] === camera) for (let object: Object3D | null = args[0]; object; object = object.parent) {
          if (object.name.startsWith('streaming.area.')) { visibleAreas.add(object.name.slice('streaming.area.'.length)); break; }
        }
        renderer.renderObject(...args);
      });
      try { tail.span('renderer.submitCpu', () => renderer.render(scene, camera)); }
      finally { if (firstFrames.size) renderer.setRenderObjectFunction(previousRenderObject); }
      for (const id of visibleAreas) {
        firstFrames.get(id)?.event('first-visible-frame', { scope: 'Main-pass mesh submitted after frustum/visibility filtering; physical presentation not measured.' });
        firstFrames.delete(id);
      }
    }
    resize();
    return {
      facts,
      render,
      resize,
      cityDebug(layer: CityDebugLayer) {
        if (!import.meta.env.DEV || !cityPresentation) throw new Error('City debug visualization requires the development city scene.');
        cityPresentation.setDebug(layer);
      },
      async prepareArea(area: WorldArea, signal: AbortSignal, camera: PerspectiveCamera, state: GameState,
        transition: ReturnType<typeof tail.beginTransition>, progress: (phase: 'preparing' | 'warming') => void) {
        if (!streaming || disposed) throw new Error('Area preparation requires the active M5 renderer.');
        progress('preparing');
        const presentation = await transition.asyncSpan('object-construction', () =>
          createAreaPresentation(area, signal, blockout, resourceReferences, assetReferences, {
            cache: preparationCache, transition,
          }));
        const scheduler = new PreparationScheduler(signal, { onWork: work => transition.work(work) });
        const shortColdWard = city?.core && (area.id === 'rural' || area.id === 'river-market' || area.id === 'lower-canal');
        if (shortColdWard) {
          presentation.group.traverse(object => { if (object instanceof Mesh) instanceBufferObjects.set(object, area.id); });
        }
        if (pipelineCache && (area.id === 'rural' || area.id === 'river-market')) {
          transition.event('pipeline-cache-start', pipelineCache.snapshot());
          presentation.group.traverse(object => { if (object instanceof Mesh) pipelineCacheObjects.set(object, area.id); });
        }
        let attachedHooks = false, released = false;
        function unload() {
          if (released) return; released = true;
          activeAreas.delete(area.id); areaPresentations.delete(area.id); firstFrames.delete(area.id);
          if (attachedHooks) livingEnvironment?.detachArea(area.id);
          presentation.group.traverse(object => { pipelineCacheObjects.delete(object); instanceBufferObjects.delete(object); });
          presentation.dispose(); facts.loadedAssetCount = 1 + assetReferences.snapshot().assets;
          transition.event('render-resources-released');
          tail.event('streaming.renderDisposed', { areaId: area.id });
        }
        try {
          throwIfAborted(signal);
          transition.span('environment-hooks', () => livingEnvironment?.attachArea(area.id, presentation.group, presentation.roofEnvelopes)); attachedHooks = true;
          // r186's initial cached sampled-texture binding can still point at an
          // unloaded area's disposed map. The M5 diagnostic captured its later
          // recreation in Bindings._createBindings. Keep transient mapped
          // material builder states scoped to their actual texture identity;
          // native pipelines can still reuse identical generated shader code.
          const keyedMaterials = new Set<Material>();
          presentation.group.traverse(object => {
            if (!(object instanceof Mesh)) return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              const map = (material as Material & { map?: Texture }).map;
              if (!(map instanceof Texture) || keyedMaterials.has(material) || keyedTransientMaterials.has(material)) continue;
              keyedMaterials.add(material);
              keyedTransientMaterials.add(material);
              const existingKey = material.customProgramCacheKey.bind(material);
              material.customProgramCacheKey = () => `${existingKey()}:streaming-map:${map.uuid}`;
            }
          });
          presentation.update(state, false);
          const culling = new Map<Mesh, boolean>();
          presentation.group.traverse(object => { if (object instanceof Mesh) { culling.set(object, object.frustumCulled); object.frustumCulled = false; } });
          progress('warming'); transition.event('warming');
          // Short departures expose the Rural/River/Canal nine-yield-per-builder
          // latency on reload. Scope complete, measured per-object builds to
          // these M8 wards. Every actual compile/shadow job still runs.
          if (shortColdWard) {
            const nodeSignal = new AbortController().signal;
            // Each indivisible build is measured against one 16 ms slice;
            // the native compile loop itself yields between every object.
            const createNodeScheduler = () => new PreparationScheduler(nodeSignal,
              { budgetMs: 16, onWork: work => transition.work(work) });
            for (const object of culling.keys()) scheduledNodeObjects.set(object, createNodeScheduler);
            transition.event('node-build-plan', { mode: 'scheduled-complete-object', objects: culling.size, budgetMs: 16, scope: 'M8 Rural/River/Canal only' });
          }
          try {
            await transition.asyncSpan('renderer-compile-async', () => tail.asyncSpan('streaming.compileAsync', () =>
              compileArea(renderer,presentation.group,camera,scene,signal,event=>
                tail.event('streaming.compileAborted',{areaId:area.id,loaded:event.loaded,total:event.total}))));
            // Real shadow updates are skipped by compileAsync. Warm the new
            // geometry/material layouts in small actual passes, yielding and
            // draining the submitted queue between them. No mutable renderer or
            // scene state survives an await.
            const meshes = [...culling.keys()];
            // ShadowNode skips a second update for the same camera in one
            // animation frame. The live player camera may already have drawn
            // before this scheduler callback; use a separate camera identity.
            // River/Canal's short M8 approach amortizes fences across four actual
            // submissions. Other areas retain two. Distinct camera identities
            // keep every real shadow update, including within one frame.
            const submissionsPerQueueWait = city?.core && (area.id === 'river-market' || area.id === 'lower-canal') ? 4 : 2;
            const warmupCameras = Array.from({ length: submissionsPerQueueWait }, () => camera.clone());
            // Instance.js emits count-sized buffers; seemingly identical meshes
            // with different instance counts/color buffers can have distinct
            // native shaders. Warm each actual mesh rather than guessing a
            // representative from geometry/material layout alone.
            const staticSignatures = new Set<string>();
            const representatives = meshes.filter(mesh => {
              if (mesh instanceof InstancedMesh) return true;
              const layout = Object.entries(mesh.geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, attribute]) => {
                const interleaved = attribute as typeof attribute & { data?: { stride: number }; offset?: number };
                return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}:${interleaved.data?.stride}:${interleaved.offset}`;
              }).join(',');
              const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.uuid).join(',');
              const key = `${materials}/${layout}/${mesh.geometry.index?.array.constructor.name}/${mesh.castShadow}/${mesh.receiveShadow}/${mesh.matrixWorld.determinant() < 0}`;
              // No animated/skinned/morph geometry in the authored slice; if
              // one is later introduced it must keep its actual warmup job.
              if (Object.keys(mesh.geometry.morphAttributes).length || 'skeleton' in mesh) return true;
              if (staticSignatures.has(key)) return false;
              staticSignatures.add(key); return true;
            });
            transition.event('warmup-plan', { meshes: meshes.length, representatives: representatives.length, submissionsPerQueueWait });
            const visible = new Map(meshes.map(mesh => [mesh, mesh.visible]));
            const warmupInventory={submissions:0,drawCalls:0,triangles:0,maximumDrawCalls:0,maximumTriangles:0,
              isolatedResidentMeshes:!!city?.upper,scope:'Offscreen shadow/main submission counters, not GPU time or visible-world geometry reduction.'};
            for (const [index, mesh] of representatives.entries()) {
              if (index % submissionsPerQueueWait === 0) await scheduler.yieldFrame();
              const warmupCamera = warmupCameras[index % submissionsPerQueueWait]!;
              await scheduler.job('renderer-shadow-submit', () => {
                const oldTarget = renderer.getRenderTarget();
                const parent = presentation.group.parent;
                try {
                  for (const object of meshes) object.visible = false;
                  // NPC child meshes need their mesh ancestors in the render tree.
                  for (let object: Object3D | null = mesh; object && object !== presentation.group; object = object.parent) object.visible = true;
                  const submit=()=>{
                    scene.add(presentation.group);warmupCamera.copy(camera);renderer.setRenderTarget(warmupTarget);
                    const calls=renderer.info.render.drawCalls,triangles=renderer.info.render.triangles;
                    transition.span('renderer-shadow-submit', () => renderer.render(scene, warmupCamera));
                    const submittedCalls=renderer.info.render.drawCalls-calls,submittedTriangles=renderer.info.render.triangles-triangles;
                    warmupInventory.submissions++;warmupInventory.drawCalls+=submittedCalls;warmupInventory.triangles+=submittedTriangles;
                    warmupInventory.maximumDrawCalls=Math.max(warmupInventory.maximumDrawCalls,submittedCalls);
                    warmupInventory.maximumTriangles=Math.max(warmupInventory.maximumTriangles,submittedTriangles);
                  };
                  // Hide only the already-warm scene before adding the new
                  // destination. Exact scene/light/target identities and all
                  // destination passes remain; restore before any await.
                  if(city?.upper)withResidentMeshesHidden(scene,submit);else submit();
                } finally {
                  renderer.setRenderTarget(oldTarget);
                  visible.forEach((value, object) => { object.visible = value; });
                  presentation.group.removeFromParent();
                  if (parent) parent.add(presentation.group);
                }
              });
              const backend = renderer.backend as typeof renderer.backend & BackendDiagnostics;
              if (backend.device) {
                if ((index + 1) % submissionsPerQueueWait === 0 || index === representatives.length - 1) {
                  await transition.asyncSpan('renderer-queue-wait', () => backend.device!.queue.onSubmittedWorkDone());
                }
              }
              else transition.span('renderer-gl-flush', () => backend.gl?.flush());
              throwIfAborted(signal);
            }
            transition.event('warmup-submission-inventory',warmupInventory);
          }
          finally { culling.forEach((value, object) => {
            object.frustumCulled = value; scheduledNodeObjects.delete(object);
          }); }
          throwIfAborted(signal);
          if (disposed) throw new DOMException('Renderer disposed during preparation', 'AbortError');
          if (pipelineCache && (area.id === 'rural' || area.id === 'river-market')) {
            transition.event('pipeline-cache-ready', pipelineCache.snapshot());
          }
          areaPresentations.set(area.id, presentation);
          facts.loadedAssetCount = 1 + assetReferences.snapshot().assets;
          return {
            activate() {
              if (released) throw new Error('Cannot activate a released area.');
              transition.span('scene-attachment', () => scene.add(presentation.group)); presentation.group.visible = true;
              activeAreas.add(area.id); livingEnvironment?.areaActive(area.id, true);
              firstFrames.set(area.id, transition);
              tail.event('streaming.renderActivated', { areaId: area.id });
            },
            deactivate() {
              presentation.group.removeFromParent(); activeAreas.delete(area.id);
              livingEnvironment?.areaActive(area.id, false);
            }, unload,
          };
        } catch (error) { unload(); throw error; }
      },
      async warmup(camera: PerspectiveCamera, state: GameState) {
        sync(state, camera);
        // Phase A traced native DXC compilation when previously culled material
        // variants first entered view. Precompile the full resident set, including
        // a real shadow submission, before reporting readiness.
        const culling = new Map<Mesh, boolean>();
        scene.traverse(object => { if (object instanceof Mesh) { culling.set(object, object.frustumCulled); object.frustumCulled = false; } });
        try {
          await tail.asyncSpan('renderer.compileAsync', () => renderer.compileAsync(scene, camera));
          render(camera, state);
        } finally { culling.forEach((value, object) => { object.frustumCulled = value; }); }
        const backend = renderer.backend as typeof renderer.backend & BackendDiagnostics;
        if (backend.device) await tail.asyncSpan('renderer.startupQueueCompletion', () => backend.device!.queue.onSubmittedWorkDone());
        else tail.span('renderer.startupGlFinish', () => backend.gl?.finish());
        if (fatalError) throw fatalError;
        facts.shadersReady = true;
        render(camera, state);
      },
      stats() {
        renderer.getDrawingBufferSize(size);
        let visibleMeshes = 0;
        let instancedMeshes = 0, instances = 0;
        const materialSet = new Set<Material>();
        scene.traverseVisible(object => {
          if (object instanceof Mesh) {
            visibleMeshes++;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) materialSet.add(material);
          }
          if (object instanceof InstancedMesh) { instancedMeshes++; instances += object.count; }
        });
        return {
          drawCalls: renderer.info.render.drawCalls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          textureInventory: [...textureInventory.values()],
          textureEvents: [...textureEvents],
          visibleMeshes,
          instancedMeshes, instances,
          visibleMaterials: materialSet.size,
          avatarVisible: player.visible,
          objectCount: scene.children.length,
          drawingBuffer: { width: size.x, height: size.y },
          viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
          dpr: renderer.getPixelRatio(),
          countScope: 'draw calls and triangles include shadow passes; visibleMeshes counts visible flags, not frustum visibility',
          city: cityPresentation?.stats() ?? null,
          living: { environment: livingEnvironment?.stats() ?? null, population: locals?.stats() ?? null,
            activeNpcs: streaming ? [...activeAreas].reduce((sum, id) => sum + (areaPresentations.get(id)?.npcStats()?.count ?? 0), 0) : locals ? statePopulationCount : 0 },
          streamingResources: streaming ? { render: resourceReferences.snapshot(), assets: assetReferences.snapshot(),
            cache: preparationCache.snapshot(),
            gpuPipelines: pipelineCache?.snapshot() ?? null,
            preparedAreas: [...areaPresentations.keys()], activeAreas: [...activeAreas],
            npcs: Object.fromEntries([...areaPresentations].map(([id, presentation]) => [id, presentation.npcStats()])) } : null,
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        restoreInstanceBufferNames?.(); restoreInstanceBufferNames = null;
        restoreScheduledNodeBuilds?.(); restoreScheduledNodeBuilds = null;
        for (const [id, presentation] of areaPresentations) { livingEnvironment?.detachArea(id); presentation.dispose(); }
        areaPresentations.clear(); activeAreas.clear();
        pipelineCache?.dispose();
        livingEnvironment?.dispose();
        cityPresentation?.dispose();
        releaseSkyline();preparationCache.dispose(); warmupTarget.dispose();
        disposeScene(scene);
        void renderer.dispose().catch(error => {
          facts.errors.push(`Renderer disposal failed: ${String(error)}`);
          console.error(error);
        });
      },
    };
  } catch (error) {
    restoreInstanceBufferNames?.(); restoreInstanceBufferNames = null;
    restoreScheduledNodeBuilds?.(); restoreScheduledNodeBuilds = null;
    livingEnvironment?.dispose();
    cityPresentation?.dispose();
    releaseSkyline();preparationCache.dispose();
    disposeScene(scene);
    pipelineCache?.dispose();
    const cleanupErrors: string[] = [];
    if (rendererInitialized) {
      try { await renderer.dispose(); }
      catch (cleanupError) { cleanupErrors.push(String(cleanupError)); }
    } else {
      // r186 Renderer.dispose() calls setAnimationLoop(), which tries init()
      // again when startup failed. Clean up backends without reentering init.
      for (const backend of new Set([primaryBackend, renderer.backend])) {
        try { await (backend as typeof backend & { dispose(): Promise<void> }).dispose(); }
        catch (cleanupError) { cleanupErrors.push(String(cleanupError)); }
      }
    }
    throw new Error(`Renderer startup failed${primaryStartupError ? ` (initial backend: ${primaryStartupError})` : ''}: ${String(error)}${cleanupErrors.length ? `; cleanup: ${cleanupErrors.join('; ')}` : ''}`);
  }
}
