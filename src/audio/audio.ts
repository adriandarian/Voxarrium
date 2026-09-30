import type { EnvironmentState } from '../simulation/environment';
import type { Vec3 } from '../simulation/types';

export type AudioCategory = 'ambience' | 'footsteps' | 'locals';
export interface AudioSettings { master: number; ambience: number; footsteps: number; locals: number }
export const DEFAULT_AUDIO: AudioSettings = { master: 0.55, ambience: 0.7, footsteps: 0.8, locals: 0.6 };
export type Surface = 'earth' | 'stone' | 'wood' | 'grass';

/** Authored surfaces in the existing slice, in meters. No material raycasts per step. */
export function footstepSurface(p: Vec3): Surface {
  if (Math.abs(p.x + 2) < 1.8 && p.z >= 12 && p.z <= 26) return 'wood';
  if ((Math.abs(p.x + 7) < 1.8 && p.z > 2.9 && p.z < 10.5) ||
      (Math.abs(p.x + 14) < 1.6 && p.z < -14.2 && p.z > -20.4) ||
      (Math.abs(p.x) < 1 && p.z > -4.5 && p.z < -2.5)) return 'stone';
  if ((p.z > -2 && p.z < 3.5 && p.x > -17 && p.x < 11) ||
      (p.x > 3.8 && p.x < 5.8 && p.z > -15 && p.z < 3) ||
      (p.z > 9.5 && p.z < 12 && p.x > -9 && p.x < 1) ||
      (p.z < -22 && p.z > -26 && p.x > -16 && p.x < 4)) return 'earth';
  return 'grass';
}

// Reproducible locally synthesized sound. No network audio, microphone or service.
function noise(context: BaseAudioContext, seconds = 3): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 73031, previous = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    previous = previous * 0.83 + (seed / 0x100000000 * 2 - 1) * 0.17;
    samples[i] = previous * 2.5;
  }
  return buffer;
}

export function createLivingAudio(settings: AudioSettings) {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  const categories = new Map<AudioCategory, GainNode>();
  const loops: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; panner?: PannerNode }[] = [];
  const voices = new Set<{ source: AudioScheduledSourceNode; nodes: AudioNode[] }>();
  let buffer: AudioBuffer | null = null;
  let disposed = false, paused = true, error: string | null = null;
  let stepCount = 0, cueCount = 0, lastSurface: Surface | null = null;
  let distance = 0, lastCue = -30;
  let previous: Vec3 | null = null;
  const levels = { wind: 0, river: 0, rain: 0 };
  const listenerPosition = { x: 0, y: 0, z: 0 };
  const sourcePosition = { x: 0, y: -0.8, z: 19 };

  function ramp(parameter: AudioParam, value: number, seconds = 0.12) {
    if (!context) return;
    parameter.setTargetAtTime(value, context.currentTime, seconds);
  }
  function spatial(position: Vec3) {
    const p = context!.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = 3; p.maxDistance = 60; p.rolloffFactor = 1.2;
    p.positionX.value = position.x; p.positionY.value = position.y; p.positionZ.value = position.z;
    return p;
  }
  function applyVolumes() {
    if (!master || !context) return;
    ramp(master.gain, paused ? 0 : settings.master, 0.025);
    for (const [category, gain] of categories) ramp(gain.gain, settings[category], 0.025);
  }
  function loop(frequency: number, position?: Vec3) {
    const source = context!.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = context!.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = frequency; filter.Q.value = 0.4;
    const gain = context!.createGain(); gain.gain.value = 0;
    source.connect(filter).connect(gain);
    const panner = position ? spatial(position) : undefined;
    if (panner) gain.connect(panner).connect(categories.get('ambience')!);
    else gain.connect(categories.get('ambience')!);
    source.start(); loops.push({ source, gain, filter, panner });
  }
  function release(voice: { source: AudioScheduledSourceNode; nodes: AudioNode[] }) {
    voice.source.disconnect(); for (const node of voice.nodes) node.disconnect(); voices.delete(voice);
  }
  function pulse(category: AudioCategory, position: Vec3, frequency: number, amplitude: number, seconds: number, tonal: boolean) {
    if (!context || paused || disposed || context.state !== 'running' || voices.size >= 5) return;
    const source = tonal ? context.createOscillator() : context.createBufferSource();
    if (source instanceof OscillatorNode) { source.type = 'sine'; source.frequency.value = frequency; }
    else { source.buffer = buffer; }
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = frequency;
    const gain = context.createGain(), now = context.currentTime;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(amplitude, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    const panner = spatial(position); panner.refDistance = category === 'footsteps' ? 1.5 : 2;
    source.connect(filter).connect(gain).connect(panner).connect(categories.get(category)!);
    const voice = { source, nodes: [filter, gain, panner] }; voices.add(voice);
    source.onended = () => release(voice);
    source.start(); source.stop(now + seconds + 0.01);
  }
  return {
    async start() {
      if (disposed) return false;
      try {
        // This method is called synchronously from Explore/Resume's click handler.
        if (!context) {
          context = new AudioContext({ latencyHint: 'interactive' });
          master = context.createGain(); master.gain.value = 0;
          analyser = context.createAnalyser(); analyser.fftSize = 1024;
          master.connect(analyser).connect(context.destination);
          for (const category of ['ambience', 'footsteps', 'locals'] as const) {
            const gain = context.createGain(); gain.connect(master); categories.set(category, gain);
          }
          buffer = noise(context); loop(340); loop(1350, sourcePosition); loop(4200);
          applyVolumes();
        }
        await context.resume();
        return !disposed && context.state === 'running';
      } catch (failure) { error = String(failure); return false; }
    },
    pause(value: boolean) {
      paused = value; previous = null; distance = 0;
      if (value) for (const voice of [...voices]) { voice.source.onended = null; voice.source.stop(); release(voice); }
      applyVolumes();
    },
    volumes() { applyVolumes(); },
    reset() { previous = null; distance = 0; lastCue = -30; },
    update(environment: EnvironmentState, player: Vec3, yaw: number, grounded: boolean, elapsed: number, nearest?: { position: Vec3; id: string } | null) {
      if (!context || disposed) return;
      const listener = context.listener, now = context.currentTime;
      Object.assign(listenerPosition, { x: player.x, y: player.y + 1.62, z: player.z });
      listener.positionX.setTargetAtTime(listenerPosition.x, now, 0.04);
      listener.positionY.setTargetAtTime(listenerPosition.y, now, 0.04);
      listener.positionZ.setTargetAtTime(listenerPosition.z, now, 0.04);
      listener.forwardX.setTargetAtTime(-Math.sin(yaw), now, 0.04);
      listener.forwardY.value = 0; listener.forwardZ.setTargetAtTime(-Math.cos(yaw), now, 0.04);
      listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
      // A long river uses its closest local point rather than one distant emitter.
      sourcePosition.x = Math.max(-44, Math.min(44, player.x));
      const river = loops[1]?.panner;
      if (river) { ramp(river.positionX, sourcePosition.x); ramp(river.positionZ, 19); }
      levels.wind = 0.045 + environment.wind * 0.055;
      levels.river = 0.18;
      levels.rain = environment.rain * 0.17;
      ramp(loops[0]!.gain.gain, levels.wind); ramp(loops[1]!.gain.gain, levels.river); ramp(loops[2]!.gain.gain, levels.rain);
      if (paused) return;
      const traveled = previous ? Math.hypot(player.x - previous.x, player.z - previous.z) : 0;
      previous = { ...player };
      if (traveled > 2) { distance = 0; return; } // recovery/teleport is not a footstep
      if (grounded) distance += traveled;
      else distance = 0;
      if (distance > 0.82) {
        distance %= 0.82; const surface = footstepSurface(player); lastSurface = surface; stepCount++;
        const timbre = { grass: [460, 0.14], earth: [800, 0.16], stone: [2600, 0.15], wood: [550, 0.2] }[surface]!;
        pulse('footsteps', player, timbre[0]!, timbre[1]!, 0.115, false);
        if (surface === 'wood') pulse('footsteps', player, 155, 0.07, 0.13, true);
      }
      if (nearest && elapsed - lastCue > 18 && environment.timeOfDay !== 'night') {
        lastCue = elapsed; cueCount++; pulse('locals', nearest.position, 330, 0.045, 0.38, true);
      }
    },
    cue(position: Vec3) { cueCount++; pulse('locals', position, 440, 0.11, 0.27, true); },
    snapshot() {
      let rms = 0;
      if (analyser) { const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples); rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length); }
      return { status: disposed ? 'disposed' : context?.state ?? 'awaiting-gesture', error, settings: { ...settings },
        paused, activeLoops: loops.length, activeVoices: voices.size, maxVoices: 8, stepCount, cueCount, lastSurface,
        levels: { ...levels }, listener: { ...listenerPosition }, riverSource: { ...sourcePosition }, outputRms: rms,
        source: 'local deterministic filtered noise and short synthesized cues; no recorded speech' };
    },
    async record(seconds: number): Promise<number[]> {
      if (!import.meta.env.DEV || !context || !master || context.state !== 'running') throw new Error('Recording requires development mode and a running audio context after a user gesture.');
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 12) throw new Error('Audio evidence recording must be bounded to 12 seconds.');
      const destination = context.createMediaStreamDestination(); master.connect(destination);
      const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
      const chunks: Blob[] = [];
      try {
        await new Promise<void>((resolve, reject) => {
          recorder.ondataavailable = event => chunks.push(event.data);
          recorder.onerror = event => reject(new Error(String(event)));
          recorder.onstop = () => resolve();
          recorder.start(); setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, seconds * 1000);
        });
        return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
      } finally {
        if (recorder.state !== 'inactive') recorder.stop();
        master.disconnect(destination); destination.stream.getTracks().forEach(track => track.stop()); destination.disconnect();
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const voice of [...voices]) { voice.source.onended = null; voice.source.stop(); release(voice); }
      for (const item of loops) { item.source.stop(); item.source.disconnect(); item.filter.disconnect(); item.gain.disconnect(); item.panner?.disconnect(); }
      loops.length = 0; categories.forEach(node => node.disconnect()); categories.clear(); master?.disconnect(); analyser?.disconnect();
      if (context) void context.close().catch(() => { /* Context may already be closed by page teardown. */ });
      buffer = null;
    },
  };
}
