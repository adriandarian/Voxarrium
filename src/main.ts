import './style.css';
import { createCourse } from './simulation/course';
import { createRuralCourse } from './simulation/rural';
import { createDistrictCourse } from './simulation/district';
import { createState } from './simulation/state';
import { FixedClock } from './simulation/clock';
import { FIXED_DT, IDLE_INPUT } from './simulation/types';
import type { CameraMode, InputFrame, Vec3 } from './simulation/types';
import { createPhysics } from './physics/physics';
import { createCameraRig } from './cameras/cameras';
import { createInput } from './input/input';
import { createGameRenderer } from './render/renderer';
import { FrameTimings } from './diagnostics/timing';
import { createEnvironment, setEnvironment, stepEnvironment } from './simulation/environment';
import type { Weather, TimeOfDay } from './simulation/environment';
import { createPopulation, stepPopulation, nearestNpc } from './simulation/npcs';
import { interactionTarget } from './simulation/interaction';
import { createLivingUi } from './ui/living';
import { createLivingAudio, DEFAULT_AUDIO } from './audio/audio';
import type { AudioSettings } from './audio/audio';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('world');
const menu = element('menu');
const notice = element('notice');
const startButton = element<HTMLButtonElement>('start');
const cameraSelect = element<HTMLSelectElement>('camera-select');
const fov = element<HTMLInputElement>('fov');
const sensitivity = element<HTMLInputElement>('sensitivity');
const weatherSelect = element<HTMLSelectElement>('weather-select');
const timeSelect = element<HTMLSelectElement>('time-select');
const qualitySelect = element<HTMLSelectElement>('quality-select');
const params = new URLSearchParams(location.search);

async function boot() {
  const rural = params.get('scene') !== 'm1';
  const district = rural && params.get('scene') !== 'm2';
  const course = district ? createDistrictCourse() : rural ? createRuralCourse() : createCourse(104729);
  if (district) {
    document.querySelector('.chapter')!.textContent = 'M4 / THE RIVER MARKET';
    element('scene-label').textContent = 'RIVER MARKET / RURAL EDGE';
    element('menu-title').textContent = 'The river market.';
    document.querySelector('.intro')!.textContent = 'Follow the market street, find the guild bell, and cross the canal to the workshops on the far quay.';
    document.querySelector('.course-features')!.innerHTML = '<span>Market & upper lane</span><span>Two river bridges</span><span>Living neighborhood</span>';
    canvas.setAttribute('aria-label', 'Voxarrium playable river market district');
    document.title = 'Voxarrium · The river market';
  }
  if (!rural) {
    document.querySelector('.chapter')!.textContent = 'M1 / HUMAN SCALE';
    element('scene-label').textContent = '64 × 64 m / GRAYBOX 01';
    element('menu-title').textContent = 'A sense of scale.';
    document.querySelector('.intro')!.textContent = 'Walk the course. Find the door, climb the terrace, cross the bridge. One unit is one meter.';
  }
  const state = createState(course);
  const livingUi = createLivingUi();
  const audioSettings = { ...DEFAULT_AUDIO };
  const audio = createLivingAudio(audioSettings, district);
  let reducedMotion = false;
  element('living-settings').hidden = !rural;
  if (rural && course.bookmarks.spawn) {
    state.camera.yaw = course.bookmarks.spawn.yaw;
    state.camera.pitch = course.bookmarks.spawn.pitch;
  }
  const physics = await createPhysics(course);
  let renderer: Awaited<ReturnType<typeof createGameRenderer>>;
  try { renderer = await createGameRenderer(canvas, course, params.get('backend') === 'webgl', params.get('stage') === 'blockout'); }
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
    state.interaction = null;
    audio.pause(paused);
    menu.hidden = !paused;
    input.clear(); pendingJump = false;
    clock.reset();
    previousPosition = { ...state.player.position };
    if (paused && document.pointerLockElement) document.exitPointerLock();
    lastFrame = performance.now();
    updateInteractionUi();
  }
  function setMode(mode: CameraMode) {
    if (mode === 'free' || mode === 'eagle-eye') state.interaction = null;
    rig.setMode(mode);
    cameraSelect.value = mode;
    element('camera-mode').textContent = mode.replace('-', ' ').toUpperCase();
    element('crosshair').hidden = mode === 'eagle-eye';
    rig.update(0, canvas.clientWidth / canvas.clientHeight);
    overlay();
  }
  function reset(position?: Vec3) {
    physics.reset(state, position);
    state.interaction = null; audio.reset();
    previousPosition = { ...state.player.position };
    clock.reset();
    rig.update(0, canvas.clientWidth / canvas.clientHeight);
  }
  function interact() {
    if (!state.environment || state.paused || state.camera.mode === 'free' || state.camera.mode === 'eagle-eye') return;
    if (state.interaction) state.interaction = null;
    else {
      const target = interactionTarget(state.population, state.player.position, state.environment);
      if (target) { state.interaction = { id: target.id, name: target.name, text: target.text, position: { ...target.position } }; audio.cue(target.position, target.id.endsWith('.entrance')); }
    }
    updateInteractionUi();
  }
  function updateInteractionUi() {
    const active = !state.paused && (state.camera.mode === 'first-person' || state.camera.mode === 'third-person');
    livingUi.update(state.environment ? interactionTarget(state.population, state.player.position, state.environment) : null, state.interaction, active);
  }
  const input = createInput(canvas, {
    onLook(dx, dy) {
      state.camera.yaw += dx * Number(sensitivity.value);
      state.camera.pitch = Math.max(-1.35, Math.min(1.35, state.camera.pitch + dy * Number(sensitivity.value)));
    },
    onMode: setMode, onPause: setPaused, onReset: () => reset(), onInteract: interact,
    onLookControl(control) {
      element('look-hint').textContent = control === 'drag' ? 'Hold left mouse + drag to look' : 'Mouse to look';
      notice.textContent = control === 'drag'
        ? 'Mouse capture is unavailable here. Hold the left mouse button and drag to look; WASD moves as usual.'
        : 'Ready. Click to capture the mouse; Esc pauses.';
    },
    isPaused: () => state.paused, getMode: () => state.camera.mode,
  });

  function tick(frame: InputFrame) {
    previousPosition = { ...state.player.position };
    const debugging = state.camera.mode === 'free' || state.camera.mode === 'eagle-eye';
    physics.step(state, debugging ? IDLE_INPUT : frame, FIXED_DT);
    if (state.environment) {
      stepEnvironment(state.environment, FIXED_DT);
      stepPopulation(state.population, FIXED_DT, state.environment, state.player.position, state.interaction?.id);
      if (state.interaction) {
        const npc = state.population.find(n => n.id === state.interaction!.id);
        const source = npc?.position ?? state.interaction.position;
        if (source && Math.hypot(source.x - state.player.position.x, source.y - state.player.position.y, source.z - state.player.position.z) > 3.3) state.interaction = null;
      }
      audio.update(state.environment, state.player.position, state.camera.yaw, state.player.grounded, state.elapsed, nearestNpc(state.population, state.player.position, 7));
    }
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
    renderer.render(rig.camera, { ...state, player: { ...state.player, position } }, reducedMotion);
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
      ...(state.environment ? [`WORLD  ${state.environment.timeOfDay} · ${state.environment.weather} · ${state.population.length} locals`] : []),
    ].join('\n');
    updateInteractionUi();
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
    startButton.disabled = true;
    notice.textContent = 'Starting controls…';
    const audioStarted = rural ? audio.start() : Promise.resolve(true);
    try {
      if (!await input.start()) {
        if (!disposed) notice.textContent = 'Game paused. Click to resume when the game is focused.';
        return;
      }
      manual = false;
      timings.reset();
      setPaused(false);
      if (!await audioStarted) notice.textContent = 'World ready. Audio is unavailable in this browser session.';
      startButton.textContent = district ? 'Return to the market' : rural ? 'Return to the garden' : 'Return to the course';
    } catch (error) {
      setPaused(true);
      notice.textContent = 'Controls could not start. Focus the game and try again.';
      console.error('Voxarrium input startup failure', error);
    } finally { if (!disposed) startButton.disabled = false; }
  };
  const onEnvironment = () => {
    if (state.environment) setEnvironment(state.environment, weatherSelect.value as Weather, timeSelect.value as TimeOfDay);
    state.interaction = null; overlay();
  };
  const onQuality = () => { reducedMotion = qualitySelect.value === 'reduced'; draw(); };
  const volumeInputs = (Object.keys(DEFAULT_AUDIO) as (keyof AudioSettings)[]).map(category => {
    const control = element<HTMLInputElement>(`volume-${category}`);
    const listener = () => { audioSettings[category] = Number(control.value); audio.volumes(); };
    control.addEventListener('input', listener);
    return { control, listener };
  });
  startButton.addEventListener('click', onStart);
  weatherSelect.addEventListener('change', onEnvironment);
  timeSelect.addEventListener('change', onEnvironment);
  qualitySelect.addEventListener('change', onQuality);
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
    weatherSelect.removeEventListener('change', onEnvironment);
    timeSelect.removeEventListener('change', onEnvironment);
    qualitySelect.removeEventListener('change', onQuality);
    volumeInputs.forEach(({ control, listener }) => control.removeEventListener('input', listener));
    cameraSelect.removeEventListener('change', onModeSelect);
    fov.removeEventListener('input', onFov);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    audio.dispose(); input.dispose(); rig.dispose(); physics.dispose(); renderer.dispose();
    delete window.__VOXARRIUM__;
  }

  // Settle the capsule before readiness. Physics, fixture and shaders are all real.
  for (let i = 0; i < 30; i++) tick(IDLE_INPUT);
  state.tick = 0; state.elapsed = 0;
  if (state.environment) state.environment = createEnvironment();
  state.population = rural ? createPopulation(district) : [];
  previousPosition = { ...state.player.position };
  rig.update(0, canvas.clientWidth / canvas.clientHeight);
  try { await renderer.warmup(rig.camera, state); }
  catch (error) { dispose(); throw error; }
  const backend = renderer.facts.backend;
  element('backend-badge').textContent = `${backend} · ${renderer.facts.fallbackOccurred ? 'WebGPU fallback' : params.get('backend') === 'webgl' ? 'explicit fallback test' : 'initialized'}`;
  element('backend-badge').title = renderer.facts.fallbackReason ?? renderer.facts.requestedBackend;
  notice.textContent = 'Ready. Blender meter and axis checks passed.';
  startButton.disabled = false;
  startButton.textContent = district ? 'Explore the market' : rural ? 'Explore the garden' : 'Enter the course';
  overlay();
  frameId = requestAnimationFrame(frame);

  const harness = {
    snapshot: () => ({
      state: structuredClone(state), facts: structuredClone(renderer.facts),
      render: renderer.stats(), timing: timings.snapshot(),
      audio: audio.snapshot(), settings: { reducedMotion, audio: { ...audioSettings } },
      camera: { position: rig.camera.position.toArray(), quaternion: rig.camera.quaternion.toArray(), fov: rig.camera.fov, aspect: rig.camera.aspect },
      bookmarks: structuredClone(course.bookmarks),
      pointerLocked: document.pointerLockElement === canvas,
    }),
    freeze(value = true) { manual = value; clock.reset(); previousPosition = { ...state.player.position }; },
    pause: setPaused,
    environment(weather: Weather, timeOfDay: TimeOfDay, immediate = false) {
      if (!state.environment) throw new Error('Living environment is unavailable in M1.');
      setEnvironment(state.environment, weather, timeOfDay, immediate);
      weatherSelect.value = weather; timeSelect.value = timeOfDay;
      draw(); overlay();
    },
    interact,
    recordAudio: (seconds: number) => audio.record(seconds),
    resetPopulation() { state.population = rural ? createPopulation(district) : []; state.interaction = null; draw(); overlay(); },
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
      if (state.environment) state.environment.time = 0;
      state.population = rural ? createPopulation(district) : []; state.interaction = null; audio.reset();
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
