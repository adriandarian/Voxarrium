import {
  ACESFilmicToneMapping, BoxGeometry, BufferGeometry, CanvasTexture,
  CapsuleGeometry, Color, DirectionalLight, Group, HemisphereLight, Material,
  Mesh, MeshStandardMaterial, PCFShadowMap, Scene, SphereGeometry, Sprite,
  SpriteMaterial, SRGBColorSpace, Texture, Vector2, Vector3, REVISION,
} from 'three';
import type { PerspectiveCamera } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { loadScaleFixture } from '../assets/fixture';
import { PLAYER } from '../simulation/types';
import type { CourseSpec, GameState } from '../simulation/types';

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

export async function createGameRenderer(canvas: HTMLCanvasElement, course: CourseSpec, forceWebGL: boolean) {
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

  let primaryStartupError: string | null = null;
  let rendererInitialized = false;
  // Preserve the native fallback, but record the failure that triggered it.
  const primaryBackend = renderer.backend;
  const initializeBackend = primaryBackend.init.bind(primaryBackend);
  primaryBackend.init = async activeRenderer => {
    try { await initializeBackend(activeRenderer); }
    catch (error) { primaryStartupError = String(error); throw error; }
  };

  try {
    await renderer.init();
    rendererInitialized = true;
    const initialized = backendDetails(renderer);
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
    scene.add(sun, new HemisphereLight(0xe4f0ff, 0x69745a, 1.65));

    const boxGeometry = new BoxGeometry(1, 1, 1);
    const materials = new Map<number, MeshStandardMaterial>();
    for (const box of course.boxes) {
      if (box.visible === false) continue;
      if (!materials.has(box.color)) materials.set(box.color, new MeshStandardMaterial({ color: box.color, roughness: 0.92, metalness: 0 }));
      const mesh = new Mesh(boxGeometry, materials.get(box.color));
      mesh.name = box.id;
      mesh.position.set(box.position.x, box.position.y, box.position.z);
      mesh.scale.set(box.size.x, box.size.y, box.size.z);
      mesh.rotation.set(box.rotationX ?? 0, box.rotationY ?? 0, 0);
      mesh.receiveShadow = true;
      mesh.castShadow = box.collides && Math.max(box.size.x, box.size.z) < 40;
      scene.add(mesh);
    }
    const labels = course.labels.map(label => {
      const sprite = createLabel(label.text);
      sprite.position.set(label.position.x, label.position.y + 0.42, label.position.z);
      scene.add(sprite);
      return sprite;
    });
    const player = createPlayer();
    scene.add(player);
    const fixture = await loadScaleFixture();
    scene.add(fixture.object);
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
    function render(camera: PerspectiveCamera, state: GameState) {
      if (disposed) throw new Error('Cannot render after renderer disposal.');
      if (fatalError) throw fatalError;
      sync(state, camera);
      renderer.info.reset();
      renderer.render(scene, camera);
    }
    resize();
    return {
      facts,
      render,
      resize,
      async warmup(camera: PerspectiveCamera, state: GameState) {
        sync(state, camera);
        await renderer.compileAsync(scene, camera);
        render(camera, state);
        const backend = renderer.backend as typeof renderer.backend & BackendDiagnostics;
        if (backend.device) await backend.device.queue.onSubmittedWorkDone();
        else backend.gl?.finish();
        if (fatalError) throw fatalError;
        facts.shadersReady = true;
      },
      stats() {
        renderer.getDrawingBufferSize(size);
        let visibleMeshes = 0;
        scene.traverseVisible(object => { if (object instanceof Mesh) visibleMeshes++; });
        return {
          drawCalls: renderer.info.render.drawCalls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          visibleMeshes,
          avatarVisible: player.visible,
          objectCount: scene.children.length,
          drawingBuffer: { width: size.x, height: size.y },
          viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
          dpr: renderer.getPixelRatio(),
          countScope: 'draw calls and triangles include shadow passes; visibleMeshes counts visible flags, not frustum visibility',
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeScene(scene);
        void renderer.dispose().catch(error => {
          facts.errors.push(`Renderer disposal failed: ${String(error)}`);
          console.error(error);
        });
      },
    };
  } catch (error) {
    disposeScene(scene);
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
