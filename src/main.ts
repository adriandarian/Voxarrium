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
import { tail } from './diagnostics/tail';
import { createEnvironment, setEnvironment, stepEnvironment } from './simulation/environment';
import type { Weather, TimeOfDay } from './simulation/environment';
import { createPopulation, createNpcNavigation, stepPopulation, nearestNpc } from './simulation/npcs';
import { interactionTarget } from './simulation/interaction';
import { createLivingUi } from './ui/living';
import { createLivingAudio, DEFAULT_AUDIO } from './audio/audio';
import type { AudioSettings } from './audio/audio';
import { createStreamingWorld } from './simulation/streaming-world';
import { createStreamingController } from './simulation/streaming';
import { areaDistance } from './simulation/streaming-contracts';
import type { AreaId } from './simulation/streaming-contracts';
import { createNpcResidency, stepResidentPopulation, npcTierCounts } from './simulation/npc-residency';
import { DISTRICT_ENTRANCES } from './simulation/district';
import { createCityWorld, cityDemand, citySafetyGates,cityBoundaryDistance } from './simulation/city-world';
import type { CityDebugLayer } from './render/city-blueprint';
import { diagnoseUrbanRepetition } from './diagnostics/urban-repetition';

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
  const production=params.get('scene')==='m7';
  const cityWorld = params.get('scene') === 'm6' || production ? createCityWorld(production) : null;
  const npcNavigation=createNpcNavigation(cityWorld?.urban.map(u=>u.npcs));
  const urbanEntrances=cityWorld?.entrances??[];
  const streamedWorld = cityWorld ?? (district && params.get('scene') !== 'm4' ? createStreamingWorld() : null);
  const course = streamedWorld?.course ?? (district ? createDistrictCourse() : rural ? createRuralCourse() : createCourse(104729));
  if (district) {
    document.querySelector('.chapter')!.textContent = 'M4 / THE RIVER MARKET';
    element('scene-label').textContent = 'RIVER MARKET / RURAL EDGE';
    element('menu-title').textContent = 'The river market.';
    document.querySelector('.intro')!.textContent = 'Follow the market street, find the guild bell, and cross the canal to the workshops on the far quay.';
    document.querySelector('.course-features')!.innerHTML = '<span>Market & upper lane</span><span>Two river bridges</span><span>Living neighborhood</span>';
    canvas.setAttribute('aria-label', 'Voxarrium playable river market district');
    document.title = 'Voxarrium · The river market';
  }
  if (streamedWorld) {
    document.querySelector('.chapter')!.textContent = 'M5 / ACROSS THE RIVER';
    element('scene-label').textContent = 'GARDEN / RIVER MARKET / EAST WORKSHOPS';
    element('menu-title').textContent = 'Across the river.';
    document.querySelector('.intro')!.textContent = 'Walk from the garden, follow the market street, and visit the workshops beyond its eastern edge.';
    document.title = 'Voxarrium · Across the river';
  }
  if (cityWorld) {
    document.querySelector('.chapter')!.textContent = 'M6 / THE TERRACED CITY';
    element('scene-label').textContent = 'RIVER / TERRACES / CITADEL';
    element('menu-title').textContent = 'The terraced city.';
    document.querySelector('.intro')!.textContent = 'Follow the river market to the eastern gate, climb the garden road, and find the citadel above the city.';
    document.querySelector('.course-features')!.innerHTML = '<span>Fourteen districts</span><span>Connected terraces</span><span>Walkable city blueprint</span>';
    canvas.setAttribute('aria-label', 'Voxarrium playable city blueprint');
    document.title = 'Voxarrium · The terraced city';
  }
  if (!rural) {
    document.querySelector('.chapter')!.textContent = 'M1 / HUMAN SCALE';
    element('scene-label').textContent = '64 × 64 m / GRAYBOX 01';
    element('menu-title').textContent = 'A sense of scale.';
    document.querySelector('.intro')!.textContent = 'Walk the course. Find the door, climb the terrace, cross the bridge. One unit is one meter.';
  }
  if(production){
    document.querySelector('.chapter')!.textContent='THE EXCHANGE & CANAL WARDS';
    element('scene-label').textContent='CENTRAL MARKET / LOWER CANAL';
    element('menu-title').textContent='Where the city gathers.';
    document.querySelector('.intro')!.textContent='Climb to the exchange hall, follow the shop streets, then take the bridge to the working quays.';
    document.querySelector('.course-features')!.innerHTML='<span>Merchant streets</span><span>Working waterfront</span><span>Living neighborhoods</span>';
    document.title='Voxarrium · Exchange & canal wards';canvas.setAttribute('aria-label','Voxarrium playable exchange and canal wards');
  }
  const state = createState(course);
  const livingUi = createLivingUi();
  const audioSettings = { ...DEFAULT_AUDIO };
  const audio = createLivingAudio(audioSettings, district,production?cityWorld?.urban:undefined,production?cityWorld?.blueprint.waterways:undefined);
  if (streamedWorld) {
    state.npcResidency = createNpcResidency();
    state.persistentInteractables = Object.fromEntries(['landmark.herbs', 'landmark.bridge', ...DISTRICT_ENTRANCES.map(entrance => entrance.id),...urbanEntrances.map(e=>e.id)]
      .map(id => [id, { visits: 0, closed: id.endsWith('.entrance') }]));
    audio.districtActive(false);
  }
  let reducedMotion = false;
  element('living-settings').hidden = !rural;
  if (rural && course.bookmarks.spawn) {
    state.camera.yaw = course.bookmarks.spawn.yaw;
    state.camera.pitch = course.bookmarks.spawn.pitch;
  }
  const physics = await tail.asyncSpan('physics.initialize', () => createPhysics(streamedWorld?.residentCourse ?? course));
  let renderer: Awaited<ReturnType<typeof createGameRenderer>>;
  try { renderer = await tail.asyncSpan('renderer.initialize', () => createGameRenderer(canvas, course, params.get('backend') === 'webgl', params.get('stage') === 'blockout', cityWorld ?? undefined)); }
  catch (error) { physics.dispose(); throw error; }
  const rig = createCameraRig(state, physics, cityWorld?.blueprint);
  const transitions = new Map<AreaId, ReturnType<typeof tail.beginTransition>>();
  const crossed = new Map<AreaId, string>();
  const boundaryNeeded = new Map<AreaId, string>();
  let residencyKey = '';
  let requestId = 0;
  const streaming = streamedWorld ? createStreamingController(streamedWorld.areas, {
    async load(area, signal, progress) {
      const transition = tail.beginTransition(area.id, ++requestId, { position: { ...state.player.position }, runSpeed: 5.4 });
      transitions.set(area.id, transition);
      transition.event('request-received');
      const cancelled = () => transition.end('cancelled');
      signal.addEventListener('abort', cancelled, { once: true });
      let presentation: Awaited<ReturnType<typeof renderer.prepareArea>> | undefined;
      let collision: Awaited<ReturnType<typeof physics.prepareArea>> | undefined;
      try {
        transition.span('data-preparation', () => { if (!area.course.boxes || !area.course.surfaces) throw new Error('Missing authored area data.'); });
        presentation = await renderer.prepareArea(area, signal, rig.camera, state, transition, progress);
        collision = await transition.asyncSpan('collider-creation', () => physics.prepareArea(area.id, area.course, signal, work => transition.work(work)));
        transition.event('ready');
        signal.removeEventListener('abort', cancelled);
        let released = false;
        return {
          activate() {
            transition.span('collider-activation', () => collision!.activate());
            presentation!.activate(); transition.event('activation-complete');
          },
          deactivate() { presentation!.deactivate(); collision!.deactivate(); transition.event('deactivated'); },
          unload() {
            if (released) return; released = true;
            collision!.unload(); presentation!.unload(); transition.end('unloaded', { released: true });
            if (transitions.get(area.id) === transition) transitions.delete(area.id);
          },
        };
      } catch (error) {
        signal.removeEventListener('abort', cancelled);
        collision?.unload(); presentation?.unload();
        transition.end(signal.aborted ? 'cancelled' : 'failed', { error: String(error) });
        if (transitions.get(area.id) === transition) transitions.delete(area.id);
        throw error;
      }
    },
  // The measured rural return needs its slot about 0.6 s earlier. Retiring an
  // already inactive lease 6 m sooner adds 1.1 s at the 5.4 m/s run speed,
  // retaining the 36/44 m entry/deactivation band and 1.5 s departure delay.
  }, { preparationLeadSeconds: 10, unloadRadius: 46 }) : null;
  let marketAudioActive = false;
  function updateStreaming(dt: number) {
    if (!streaming || disposed) return;
    streaming.update(state.player.position, dt, state.player.velocity,
      cityWorld ? cityDemand(cityWorld.areas, state.player.position, state.player.velocity) : undefined);
    for (const area of streamedWorld!.areas) {
      const transition = transitions.get(area.id);
      const distance = areaDistance(area, state.player.position);
      const neededDistance=cityWorld?cityBoundaryDistance(area,state.player.position,cityWorld.urban):distance;
      if (transition && neededDistance <= 1 && boundaryNeeded.get(area.id) !== transition.id) {
        boundaryNeeded.set(area.id, transition.id); transition.event('boundary-needed');
      }
      if (transition && distance === 0 && crossed.get(area.id) !== transition.id) {
        crossed.set(area.id, transition.id); transition.event('boundary-crossed');
      }
    }
    physics.streamingGates(streaming.activeIds(), state.player.position,
      cityWorld ? citySafetyGates(cityWorld.blueprint, streaming.activeIds(), state.player.position,cityWorld.urban) : undefined);
    if(production)audio.urbanZone(streamedWorld!.areas.filter(a=>a.urban && streaming.activeIds().includes(a.id)).sort((a,b)=>
      areaDistance(a,state.player.position)-areaDistance(b,state.player.position)||
      Math.hypot(a.course.spawn.x-state.player.position.x,a.course.spawn.z-state.player.position.z)-Math.hypot(b.course.spawn.x-state.player.position.x,b.course.spawn.z-state.player.position.z))[0]?.id??null);
    const marketActive = streaming.activeIds().includes('river-market');
    if (marketActive !== marketAudioActive) {
      marketAudioActive = marketActive;
      const transition = transitions.get('river-market');
      if (transition) transition.span('audio-emitter-setup', () => audio.districtActive(marketActive));
      else audio.districtActive(marketActive);
    }
  }
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
      const target = interactionTarget(state.population, state.player.position, state.environment,npcNavigation,urbanEntrances);
      if (target) {
        state.interaction = { id: target.id, name: target.name, text: target.text, position: { ...target.position } };
        const persistent = state.persistentInteractables?.[target.id]; if (persistent) persistent.visits++;
        audio.cue(target.position, target.id.endsWith('.entrance')||target.id.endsWith('.rear-entrance'));
      }
    }
    updateInteractionUi();
  }
  function updateInteractionUi() {
    const active = !state.paused && (state.camera.mode === 'first-person' || state.camera.mode === 'third-person');
    livingUi.update(state.environment ? interactionTarget(state.population, state.player.position, state.environment,npcNavigation,urbanEntrances) : null, state.interaction, active);
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
    updateStreaming(FIXED_DT);
    previousPosition = { ...state.player.position };
    const debugging = state.camera.mode === 'free' || state.camera.mode === 'eagle-eye';
    physics.step(state, debugging ? IDLE_INPUT : frame, FIXED_DT);
    if (state.environment) {
      stepEnvironment(state.environment, FIXED_DT);
      if (streaming && state.npcResidency) {
        const loaded = streaming.loadedIds(), active = streaming.activeIds();
        const nextKey = `${loaded.join(',')}/${active.join(',')}`;
        const updatePopulation = () => stepResidentPopulation(state.population, state.npcResidency!, FIXED_DT,
          state.environment!, state.player.position, loaded, active, state.interaction?.id ?? null,npcNavigation);
        const transition = [...transitions.values()].at(-1);
        if (transition && nextKey !== residencyKey) transition.span('npc-tier-transition', updatePopulation, { loaded, active, persistentIds: state.population.length });
        else updatePopulation();
        residencyKey = nextKey;
      } else stepPopulation(state.population, FIXED_DT, state.environment, state.player.position, state.interaction?.id,npcNavigation);
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
    const callbackStart = performance.now();
    tail.frame(now, callbackStart);
    try {
      const deltaMs = Math.max(0, now - lastFrame);
      lastFrame = now;
      const actions = state.paused || manual ? IDLE_INPUT : input.read();
      pendingJump ||= actions.jump;
      const suspended = state.paused || manual || document.hidden;
      if (suspended) updateStreaming(0);
      const alpha = tail.span('simulation.fixedSteps', () => clock.advance(now, suspended, () => {
        tick({ ...actions, jump: pendingJump });
        pendingJump = false;
      }));
      if (!suspended) timings.record(deltaMs);
      tail.span('presentation.draw', () => draw(suspended ? 1 : alpha, Math.min(deltaMs / 1000, 0.1)));
      if (now - lastOverlay > 250) { tail.span('ui.overlay', overlay); lastOverlay = now; }
      frameId = requestAnimationFrame(frame);
    } catch (error) { dispose(); showFailure(error); }
    finally {
      const durationMs = performance.now() - callbackStart;
      if (durationMs > 16) tail.event('frame.callback', { durationMs });
    }
  }
  const onResize = () => { renderer.resize(); draw(); };
  const onVisibility = () => { if (document.hidden) setPaused(true); clock.reset(); };
  const onBlur = () => setPaused(true);
  const onFov = () => {
    rig.setFov(Number(fov.value));
    element('fov-value').textContent = `${fov.value}°`;
  };
  const onModeSelect = () => setMode(cameraSelect.value as CameraMode);
  let cityDebugControls: HTMLElement | undefined;
  let repetitionPanel:HTMLElement|undefined;
  function showRepetition(visible:boolean){
    if(!import.meta.env.DEV || !production)return;
    if(!repetitionPanel){
      repetitionPanel=document.createElement('pre');repetitionPanel.id='urban-repetition';
      repetitionPanel.style.cssText='position:fixed;right:20px;top:90px;max-width:540px;max-height:65vh;overflow:auto;padding:18px;background:#18211fed;color:#eee4cc;font:12px/1.5 monospace;z-index:30;white-space:pre-wrap;pointer-events:auto';
      document.body.append(repetitionPanel);
    }
    repetitionPanel.hidden=!visible;
    if(visible)repetitionPanel.textContent=cityWorld!.urban.map(u=>{
      const d=diagnoseUrbanRepetition(u);
      return `${u.id} · ${d.buildings} buildings\n${d.findings.slice(0,12).map(f=>`${f.kind}: ${f.buildingIds.map(id=>id.split('.').at(-1)).join(', ')}\n  ${f.signature}`).join('\n')}\n${d.findings.length} review hints. Full IDs/signatures in capture JSON.\n`;
    }).join('\n')+'Grammar diagnostics guide human review. No global variety score.';
  }
  if (import.meta.env.DEV && cityWorld) {
    const panel = document.createElement('details'); panel.className = 'living-settings'; panel.id = 'city-debug';
    panel.innerHTML = '<summary>City review cameras & overlays</summary><div class="settings"><label>View<select id="city-view"></select></label><label>Overlay<select id="city-layer"></select></label></div>';
    const view = panel.querySelector<HTMLSelectElement>('#city-view')!;
    for (const camera of cityWorld.blueprint.cameras) view.add(new Option(camera.id.replaceAll('-', ' '), camera.id));
    view.addEventListener('change', () => { rig.setDebugCamera(view.value); setMode('eagle-eye'); draw(); });
    const layer = panel.querySelector<HTMLSelectElement>('#city-layer')!;
    for (const name of ['none', 'districts', 'roads', 'waterways', 'bridges', 'elevation', 'streaming']) layer.add(new Option(name, name));
    layer.addEventListener('change', () => { renderer.cityDebug(layer.value as CityDebugLayer); draw(); });
    menu.querySelector('.menu-card')!.append(panel); cityDebugControls = panel;
    if(production){const button=document.createElement('button');button.type='button';button.textContent='Review building repetition';button.addEventListener('click',()=>showRepetition(true));panel.append(button);}
  }
  const onStart = async () => {
    startButton.disabled = true;
    notice.textContent = 'Starting controls…';
    const audioStarted = rural ? tail.asyncSpan('audio.start', () => audio.start()) : Promise.resolve(true);
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
    repetitionPanel?.remove();
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
    cityDebugControls?.remove();
    streaming?.dispose(); audio.dispose(); input.dispose(); rig.dispose(); physics.dispose(); renderer.dispose(); tail.dispose();
    delete window.__VOXARRIUM__;
  }

  // Settle the capsule before readiness. Physics, fixture and shaders are all real.
  try {
    if (streaming) {
      rig.update(0, canvas.clientWidth / canvas.clientHeight);
      updateStreaming(0); await streaming.settled(); updateStreaming(0);
      if (!streaming.ready('rural')) throw new Error(`Initial area failed: ${JSON.stringify(streaming.snapshot().errors)}`);
      // The cold market's measured 14s preparation exceeds the ~10s straight
      // run from natural spawn. Prepare this one known neighbor before Explore;
      // the shell stays unloaded and normal movement releases the startup hint.
      streaming.preload('river-market'); await streaming.settled(); updateStreaming(0);
      if (!streaming.ready('river-market')) throw new Error(`Initial neighbor failed: ${JSON.stringify(streaming.snapshot().errors)}`);
    }
  } catch (error) { dispose(); throw error; }
  for (let i = 0; i < 30; i++) tick(IDLE_INPUT);
  state.tick = 0; state.elapsed = 0;
  if (state.environment) state.environment = createEnvironment();
  state.population = rural ? createPopulation(district,npcNavigation) : [];
  previousPosition = { ...state.player.position };
  rig.update(0, canvas.clientWidth / canvas.clientHeight);
  try { await renderer.warmup(rig.camera, state); }
  catch (error) { dispose(); throw error; }
  const backend = renderer.facts.backend;
  element('backend-badge').textContent = `${backend} · ${renderer.facts.fallbackOccurred ? 'WebGPU fallback' : params.get('backend') === 'webgl' ? 'explicit fallback test' : 'initialized'}`;
  element('backend-badge').title = renderer.facts.fallbackReason ?? renderer.facts.requestedBackend;
  notice.textContent = 'Ready. Blender meter and axis checks passed.';
  startButton.disabled = false;
  startButton.textContent = production ? 'Explore the wards' : streamedWorld ? 'Explore the garden' : district ? 'Explore the market' : rural ? 'Explore the garden' : 'Enter the course';
  overlay();
  frameId = requestAnimationFrame(frame);

  const harness = {
    position: () => ({ ...state.player.position }),
    steer(yaw: number, pitch = -0.09) { state.camera.yaw = yaw; state.camera.pitch = pitch; },
    snapshot: () => ({
      state: structuredClone(state), facts: structuredClone(renderer.facts),
      render: renderer.stats(), timing: timings.snapshot(),
      tail: tail.snapshot(),
      streaming: streaming?.snapshot() ?? null, physics: physics.stats(),
      npcTiers: npcTierCounts(state.population, state.npcResidency),
      audio: audio.snapshot(), settings: { reducedMotion, audio: { ...audioSettings } },
      camera: { position: rig.camera.position.toArray(), quaternion: rig.camera.quaternion.toArray(), fov: rig.camera.fov, aspect: rig.camera.aspect },
      bookmarks: structuredClone(course.bookmarks),
      city: cityWorld ? { districts: structuredClone(cityWorld.blueprint.districts), cameras: structuredClone(cityWorld.blueprint.cameras),
        route: structuredClone(cityWorld.route), connections: structuredClone(cityWorld.blueprint.connections), assumptions: [...cityWorld.blueprint.assumptions],
        urban:cityWorld.urban.map(u=>({id:u.id,identity:u.identity,route:u.route,views:u.views,eagle:u.eagle,entrances:cityWorld.entrances.filter(e=>e.id.startsWith(`m7.${u.id}`)),
          repetition:import.meta.env.DEV?diagnoseUrbanRepetition(u):null})) } : null,
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
    resetPopulation() { state.population = rural ? createPopulation(district,npcNavigation) : []; state.interaction = null; draw(); overlay(); },
    mode: setMode,
    cityDebug(layer: CityDebugLayer) { renderer.cityDebug(layer); draw(); },
    cityCamera(id: string) { rig.setDebugCamera(id); setMode('eagle-eye'); draw(); },
    urbanDiagnostics:showRepetition,
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
      state.population = rural ? createPopulation(district,npcNavigation) : []; state.interaction = null; audio.reset();
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
    resetTail() { tail.reset(); },
    discardExportedTransitions() { tail.discardExportedTransitions(); },
    async settleStreaming() { updateStreaming(0); await streaming?.settled(); updateStreaming(0); },
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
