import type { Vec3 } from './types';

export type Weather = 'clear' | 'cloudy' | 'rain';
export type TimeOfDay = 'day' | 'dusk' | 'night';
export interface EnvironmentColor { r: number; g: number; b: number }
export interface EnvironmentLighting {
  sunPosition: Vec3;
  sunIntensity: number;
  sunColor: EnvironmentColor;
  fillIntensity: number;
  fillColor: EnvironmentColor;
  groundColor: EnvironmentColor;
  skyColor: EnvironmentColor;
}
interface EnvironmentValues {
  wind: number;
  cloudiness: number;
  rain: number;
  lighting: EnvironmentLighting;
}
/** No renderer objects, wall-clock reads, random samples or hidden transition state. */
export interface EnvironmentState extends EnvironmentValues {
  version: 1;
  weather: Weather;
  timeOfDay: TimeOfDay;
  /** Seconds advanced by the fixed simulation loop; rendering never advances it. */
  time: number;
  wetness: number;
  transition: { elapsed: number; duration: number; from: EnvironmentValues; to: EnvironmentValues } | null;
}

const TRANSITION_SECONDS = 4;

// Three.js's default working space is linear sRGB. Store linear components so
// interpolating presets neither changes clear-day light nor rounds through hex.
function color(hex: number): EnvironmentColor {
  const linear = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return { r: linear((hex >> 16 & 255) / 255), g: linear((hex >> 8 & 255) / 255), b: linear((hex & 255) / 255) };
}

function preset(weather: Weather, timeOfDay: TimeOfDay): EnvironmentValues {
  const time = {
    day: { sunPosition: { x: -30, y: 65, z: 24 }, sunIntensity: 2.75, sunColor: color(0xffedcc),
      fillIntensity: 1.85, fillColor: color(0xf0efe0), groundColor: color(0x797f61), skyColor: color(0xc8dae1) },
    dusk: { sunPosition: { x: -57, y: 27, z: 10 }, sunIntensity: 1.65, sunColor: color(0xffc38e),
      fillIntensity: 1.32, fillColor: color(0xbcc4d8), groundColor: color(0x77735e), skyColor: color(0xbcb9c7) },
    night: { sunPosition: { x: 23, y: 52, z: -28 }, sunIntensity: 0.62, sunColor: color(0xb7d2f5),
      fillIntensity: 1.18, fillColor: color(0xb6c6dd), groundColor: color(0x818779), skyColor: color(0x28394f) },
  }[timeOfDay];
  const overcast = weather === 'clear' ? 0 : weather === 'cloudy' ? 0.68 : 1;
  const weatherSky = color(timeOfDay === 'night' ? 0x273545 : timeOfDay === 'dusk' ? 0x9496a8 : 0x99abb3);
  return {
    wind: weather === 'clear' ? 0.22 : weather === 'cloudy' ? 0.38 : 0.58,
    cloudiness: weather === 'clear' ? 0.08 : weather === 'cloudy' ? 0.72 : 1,
    rain: weather === 'rain' ? 1 : 0,
    lighting: { ...time, sunIntensity: time.sunIntensity * (1 - overcast * 0.60),
      fillIntensity: time.fillIntensity * (1 - overcast * 0.12),
      skyColor: blendColor(time.skyColor, weatherSky, overcast) },
  };
}

function blendColor(a: EnvironmentColor, b: EnvironmentColor, t: number): EnvironmentColor {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function blend(a: EnvironmentValues, b: EnvironmentValues, t: number): EnvironmentValues {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return { wind: lerp(a.wind, b.wind), cloudiness: lerp(a.cloudiness, b.cloudiness), rain: lerp(a.rain, b.rain),
    lighting: {
      sunPosition: { x: lerp(a.lighting.sunPosition.x, b.lighting.sunPosition.x),
        y: lerp(a.lighting.sunPosition.y, b.lighting.sunPosition.y), z: lerp(a.lighting.sunPosition.z, b.lighting.sunPosition.z) },
      sunIntensity: lerp(a.lighting.sunIntensity, b.lighting.sunIntensity),
      sunColor: blendColor(a.lighting.sunColor, b.lighting.sunColor, t),
      fillIntensity: lerp(a.lighting.fillIntensity, b.lighting.fillIntensity),
      fillColor: blendColor(a.lighting.fillColor, b.lighting.fillColor, t),
      groundColor: blendColor(a.lighting.groundColor, b.lighting.groundColor, t),
      skyColor: blendColor(a.lighting.skyColor, b.lighting.skyColor, t),
    } };
}

export function createEnvironment(): EnvironmentState {
  return { version: 1, weather: 'clear', timeOfDay: 'day', time: 0, wetness: 0, transition: null, ...preset('clear', 'day') };
}

/** Changing a preset mid-blend starts at the current visible values, without a jump. */
export function setEnvironment(state: EnvironmentState, weather: Weather, timeOfDay: TimeOfDay, immediate = false): void {
  if (!['clear', 'cloudy', 'rain'].includes(weather) || !['day', 'dusk', 'night'].includes(timeOfDay)) {
    throw new Error('Unknown environment preset.');
  }
  if (!immediate && weather === state.weather && timeOfDay === state.timeOfDay) return;
  const to = preset(weather, timeOfDay);
  state.weather = weather; state.timeOfDay = timeOfDay;
  if (immediate) {
    Object.assign(state, to);
    state.wetness = to.rain;
    state.transition = null;
  } else {
    const from = structuredClone({ wind: state.wind, cloudiness: state.cloudiness, rain: state.rain, lighting: state.lighting });
    state.transition = { elapsed: 0, duration: TRANSITION_SECONDS, from, to };
  }
}

export function stepEnvironment(state: EnvironmentState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  // The caller supplies FIXED_DT. Bound accidental long steps like the physics clock.
  const elapsed = Math.min(dt, 0.1);
  state.time += elapsed;
  if (state.transition) {
    const transition = state.transition;
    transition.elapsed = Math.min(transition.duration, transition.elapsed + elapsed);
    const t = transition.elapsed / transition.duration;
    Object.assign(state, blend(transition.from, transition.to, t * t * (3 - 2 * t)));
    if (transition.elapsed >= transition.duration - 1e-9) {
      Object.assign(state, transition.to);
      state.transition = null;
    }
  }
  // Rain darkens exposed surfaces gradually; the slice dries more slowly.
  const rate = state.rain > state.wetness ? 0.11 : 0.018;
  const difference = state.rain - state.wetness;
  state.wetness = Math.max(0, Math.min(1, state.wetness + Math.sign(difference) * Math.min(Math.abs(difference), elapsed * rate)));
}
