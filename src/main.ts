import './style.css';
import { createCourse } from './simulation/course';
import { createState } from './simulation/state';
import { FixedClock } from './simulation/clock';
import { FIXED_DT, IDLE_INPUT } from './simulation/types';
import type { CameraMode, InputFrame, Vec3 } from './simulation/types';
import { createPhysics } from './physics/physics';
import { createCameraRig } from './cameras/cameras';
import { createInput } from './input/input';
import { createGameRenderer } from './render/renderer';
import { FrameTimings } from './diagnostics/timing';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('world');
const menu = element('menu');
const notice = element('notice');
const startButton = element<HTMLButtonElement>('start');
const cameraSelect = element<HTMLSelectElement>('camera-select');
const fov = element<HTMLInputElement>('fov');
const sensitivity = element<HTMLInputElement>('sensitivity');
const params = new URLSearchParams(location.search);

async function boot() {
  const course = createCourse(104729);
  const state = createState(course);
  const physics = await createPhysics(course);
  let renderer: Awaited<ReturnType<typeof createGameRenderer>>;
  try { renderer = await createGameRenderer(canvas, course, params.get('backend') === 'webgl'); }
  catch (error) { physics.dispose(); throw error; }
  const rig = createCameraRig(state, physics);
  const clock = new FixedClock();
  const timings = new FrameTimings();
  let previousPosition = { ...state.player.position };
  let manual = params.get('test') === '1';
  let lastFrame = performance.now();
  let lastOverlay = 0;
  let pendingJump = false;
  let frameId = 0;
  let disposed = false;

  function setPaused(paused: boolean) {
    state.paused = paused;
    menu.hidden = !paused;
    input.clear(); pendingJump = false;
    clock.reset();
    previousPosition = { ...state.player.position };
    if (paused && document.pointerLockElement) document.exitPointerLock();
    lastFrame = performance.now();
  }
  function setMode(mode: CameraMode) {
    rig.setMode(mode);
    cameraSelect.value = mode;
    element('camera-mode').textContent = mode.replace('-', ' ').toUpperCase();
    element('crosshair').hidden = mode === 'eagle-eye';
    rig.update(0, canvas.clientWidth / canvas.clientHeight);
    overlay();
  }
  function reset(position?: Vec3) {
    physics.reset(state, position);
    previousPosition = { ...state.player.position };
    clock.reset();
    rig.update(0, canvas.clientWidth / canvas.clientHeight);
  }
  const input = createInput(canvas, {
    onLook(dx, dy) {
      state.camera.yaw += dx * Number(sensitivity.value);
      state.camera.pitch = Math.max(-1.35, Math.min(1.35, state.camera.pitch + dy * Number(sensitivity.value)));
    },
    onMode: setMode, onPause: setPaused, onReset: () => reset(),
    isPaused: () => state.paused, getMode: () => state.camera.mode,
  });

  function tick(frame: InputFrame) {
    previousPosition = { ...state.player.position };
    const debugging = state.camera.mode === 'free' || state.camera.mode === 'eagle-eye';
    physics.step(state, debugging ? IDLE_INPUT : frame, FIXED_DT);
    if (state.camera.mode === 'free') rig.moveFree(frame, FIXED_DT);
  }
  function draw(alpha = 1, delta = 0) {
    const current = state.player.position;
    const position = {
      x: previousPosition.x + (current.x - previousPosition.x) * alpha,
      y: previousPosition.y + (current.y - previousPosition.y) * alpha,
      z: previousPosition.z + (current.z - previousPosition.z) * alpha,
    };
    rig.update(delta, canvas.clientWidth / canvas.clientHeight, position);
    renderer.render(rig.camera, { ...state, player: { ...state.player, position } });
  }
  function overlay() {
    const p = state.player.position;
    const report = timings.snapshot();
    element('diagnostics').textContent = [
      `SCENE  ${state.sceneId}`,
      `MODE   ${state.camera.mode}`,
      `XYZ    ${p.x.toFixed(2)}  ${p.y.toFixed(2)}  ${p.z.toFixed(2)} m`,
      `STATE  ${state.paused ? 'paused' : state.player.grounded ? 'grounded' : 'airborne'} · tick ${state.tick}`,
      `FRAME  ${report.fps.toFixed(1)} FPS · ${report.medianFrameMs.toFixed(2)} ms median`,
      `P95    ${report.p95FrameMs.toFixed(2)} ms · ${renderer.facts.backend}`,
    ].join('\n');
  }
  function frame(now: number) {
    if (disposed) return;
    try {
      const deltaMs = Math.max(0, now - lastFrame);
      lastFrame = now;
      const actions = state.paused || manual ? IDLE_INPUT : input.read();
      pendingJump ||= actions.jump;
      const suspended = state.paused || manual || document.hidden;
      const alpha = clock.advance(now, suspended, () => {
        tick({ ...actions, jump: pendingJump });
        pendingJump = false;
      });
      if (!suspended) timings.record(deltaMs);
      draw(suspended ? 1 : alpha, Math.min(deltaMs / 1000, 0.1));
      if (now - lastOverlay > 250) { overlay(); lastOverlay = now; }
      frameId = requestAnimationFrame(frame);
    } catch (error) { dispose(); showFailure(error); }
  }
  const onResize = () => { renderer.resize(); draw(); };
  const onVisibility = () => { if (document.hidden) setPaused(true); clock.reset(); };
  const onBlur = () => setPaused(true);
  const onFov = () => {
    rig.setFov(Number(fov.value));
    element('fov-value').textContent = `${fov.value}°`;
  };
  const onModeSelect = () => setMode(cameraSelect.value as CameraMode);
  const onStart = async () => {
    try {
      await input.requestPointerLock();
      manual = false;
      timings.reset();
      setPaused(false);
      startButton.textContent = 'Return to the course';
    } catch (error) {
      setPaused(true);
      notice.textContent = `Mouse capture did not start: ${error instanceof Error ? error.message : String(error)}. Click again when the browser is focused.`;
    }
  };
  startButton.addEventListener('click', onStart);
  cameraSelect.addEventListener('change', onModeSelect);
  fov.addEventListener('input', onFov);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    startButton.removeEventListener('click', onStart);
    cameraSelect.removeEventListener('change', onModeSelect);
    fov.removeEventListener('input', onFov);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    input.dispose(); rig.dispose(); physics.dispose(); renderer.dispose();
    delete window.__VOXARRIUM__;
  }

  // Settle the capsule before readiness. Physics, fixture and shaders are all real.
  for (let i = 0; i < 30; i++) tick(IDLE_INPUT);
  state.tick = 0; state.elapsed = 0;
  previousPosition = { ...state.player.position };
  rig.update(0, canvas.clientWidth / canvas.clientHeight);
  try { await renderer.warmup(rig.camera, state); }
  catch (error) { dispose(); throw error; }
  const backend = renderer.facts.backend;
  element('backend-badge').textContent = `${backend} · ${renderer.facts.fallbackOccurred ? 'WebGPU fallback' : params.get('backend') === 'webgl' ? 'explicit fallback test' : 'initialized'}`;
  element('backend-badge').title = renderer.facts.fallbackReason ?? renderer.facts.requestedBackend;
  notice.textContent = 'Ready. Blender meter and axis checks passed.';
  startButton.disabled = false;
  startButton.textContent = 'Enter the course';
  overlay();
  frameId = requestAnimationFrame(frame);

  const harness = {
    snapshot: () => ({
      state: structuredClone(state), facts: structuredClone(renderer.facts),
      render: renderer.stats(), timing: timings.snapshot(),
      camera: { position: rig.camera.position.toArray(), quaternion: rig.camera.quaternion.toArray(), fov: rig.camera.fov, aspect: rig.camera.aspect },
      bookmarks: structuredClone(course.bookmarks),
      pointerLocked: document.pointerLockElement === canvas,
    }),
    freeze(value = true) { manual = value; clock.reset(); previousPosition = { ...state.player.position }; },
    pause: setPaused,
    mode: setMode,
    look(yaw: number, pitch: number) { state.camera.yaw = yaw; state.camera.pitch = pitch; draw(1, 0); overlay(); },
    teleport(position: Vec3) { reset(position); draw(); overlay(); },
    bookmark(name: string, mode: CameraMode = 'third-person') {
      const bookmark = course.bookmarks[name];
      if (!bookmark) throw new Error(`Unknown bookmark: ${name}`);
      manual = true; setPaused(false); reset(bookmark.position);
      state.camera.yaw = bookmark.yaw; state.camera.pitch = bookmark.pitch;
      setMode(mode);
      for (let i = 0; i < 30; i++) tick(IDLE_INPUT);
      state.tick = 0; state.elapsed = 0; state.resets = 0;
      previousPosition = { ...state.player.position };
      draw(1, 0); overlay();
    },
    step(frames: number, actions: Partial<InputFrame> = {}) {
      if (!manual) throw new Error('Freeze realtime simulation before deterministic stepping.');
      if (!Number.isInteger(frames) || frames < 0 || frames > 3600) throw new Error('Step count must be an integer in [0,3600].');
      for (let i = 0; i < frames; i++) if (!state.paused) tick({ ...IDLE_INPUT, ...actions, jump: !!actions.jump && i === 0 });
      previousPosition = { ...state.player.position };
      draw(1, 0); overlay();
      return structuredClone(state);
    },
    resetTimings() { timings.reset(); },
    dispose,
  };
  // Explicit development capture entrypoint; never exposed in the production bundle.
  if (import.meta.env.DEV && params.get('test') === '1') window.__VOXARRIUM__ = harness;
  document.documentElement.dataset.ready = 'true';
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  return harness;
}

export type RuntimeHarness = Awaited<ReturnType<typeof boot>>;
declare global { interface Window { __VOXARRIUM__?: RuntimeHarness } }

function showFailure(error: unknown) {
  console.error('Voxarrium startup/runtime failure', error);
  menu.hidden = true;
  const fatal = element('fatal');
  fatal.hidden = false;
  fatal.textContent = `Voxarrium could not continue.\n\n${error instanceof Error ? error.message : String(error)}\n\nReload to retry. For an explicit WebGL 2 test, open /?backend=webgl. See the browser console for details.`;
  document.documentElement.dataset.ready = 'failed';
}

void boot().catch(showFailure);
