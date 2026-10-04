import { stepPopulation } from './npcs';
import type { NpcState, NpcEnvironment, NpcNavigation } from './npcs';
import type { AreaId } from './streaming-contracts';
import type { Vec3 } from './types';

export type NpcTier = 'nearby-full' | 'loaded-reduced' | 'unloaded-data';
export interface NpcResidency {
  version: 1;
  entries: Record<string, { tier: NpcTier; pendingSeconds: number; unloadedSeconds: number;
    observedSchedule: NpcEnvironment['timeOfDay']; observedWeather: NpcEnvironment['weather'] }>;
}
export const createNpcResidency = (): NpcResidency => ({ version: 1, entries: {} });
export const npcArea = (id: string): AreaId => {
  for(const area of ['central-market','lower-canal','civic-terrace','garden-terrace','south-gate'] as const)
    if(id.startsWith(`m7.${area}.`)||id.startsWith(`m8.${area}.`))return area;
  return id.startsWith('district.')?'river-market':'rural';
};

/** Data-only NPCs preserve their in-progress segment/wait. We track the current
 * authored schedule target but perform no offscreen pathfinding or animation.
 * On return the same state continues, responding to current weather/time.
 */
export function stepResidentPopulation(population: NpcState[], residency: NpcResidency, dt: number,
  environment: NpcEnvironment, player: Vec3, loaded: readonly AreaId[], active: readonly AreaId[], interactingId: string | null,navigation?:NpcNavigation) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1);
  for (const npc of population) {
    const area = npcArea(npc.id);
    const nearby = Math.hypot(npc.position.x - player.x, npc.position.z - player.z) <= 20;
    const tier: NpcTier = !loaded.includes(area) ? 'unloaded-data'
      : active.includes(area) && nearby ? 'nearby-full' : 'loaded-reduced';
    const entry = residency.entries[npc.id] ??= { tier, pendingSeconds: 0, unloadedSeconds: 0,
      observedSchedule: environment.timeOfDay, observedWeather: environment.weather };
    entry.tier = tier; entry.observedSchedule = environment.timeOfDay; entry.observedWeather = environment.weather;
    if (tier === 'unloaded-data') {
      entry.unloadedSeconds += dt; npc.speed = 0;
      continue;
    }
    entry.pendingSeconds += dt;
    if (tier === 'nearby-full' || entry.pendingSeconds >= .1 - 1e-9) {
      const elapsed = entry.pendingSeconds;
      entry.pendingSeconds = 0;
      // Normal caller is a fixed step; the cap also safely consumes the <=100ms
      // remainder when a reduced NPC becomes nearby mid-segment.
      for (let remaining = elapsed; remaining > 1e-9; remaining -= .1)
        stepPopulation([npc], Math.min(.1, remaining), environment, player, interactingId,navigation);
    }
  }
}
export function npcTierCounts(population: NpcState[], residency: NpcResidency | undefined) {
  const counts = { 'nearby-full': 0, 'loaded-reduced': 0, 'unloaded-data': 0 };
  for (const npc of population) counts[residency?.entries[npc.id]?.tier ?? 'unloaded-data']++;
  return { counts, persistentIds: population.length, uniqueIds: new Set(population.map(npc => npc.id)).size,
    policy: 'nearby fixed step; loaded reduced 10 Hz; unloaded data only preserves route progress, observes authored environment targets without navigation' };
}
