import type { CityBlueprint } from './city-contracts';
import type { Vec3 } from './types';

export interface CityBridgeSpan { roadId: string; segment: number; a: Vec3; b: Vec3; width: number; waterLevel: number }
/** Pure authoring-data clipping: bridge-class links also include ordinary land approaches. */
export function cityBridgeSpans(blueprint: CityBlueprint): CityBridgeSpan[] {
  const result: CityBridgeSpan[] = [];
  for (const road of blueprint.roads.filter(item => item.kind === 'bridge')) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!, b = road.points[i]!, dx = b.x - a.x, dz = b.z - a.z;
    const intervals: { start: number; end: number; waterLevel: number }[] = [];
    for (const river of blueprint.waterways) for (let j = 1; j < river.points.length; j++) {
      const c = river.points[j - 1]!, d = river.points[j]!, length = Math.hypot(d.x - c.x, d.z - c.z);
      if (length < .001) continue;
      const ux = (d.x - c.x) / length, uz = (d.z - c.z) / length;
      const along = (a.x - c.x) * ux + (a.z - c.z) * uz, across = -(a.x - c.x) * uz + (a.z - c.z) * ux;
      const velocityAlong = dx * ux + dz * uz, velocityAcross = -dx * uz + dz * ux;
      const half = river.width / 2 + 1.1;
      let start = 0, end = 1, valid = true;
      for (const [origin, velocity, min, max] of [[along, velocityAlong, -half, length + half], [across, velocityAcross, -half, half]]) {
        if (Math.abs(velocity!) < 1e-8) { if (origin! < min! || origin! > max!) valid = false; continue; }
        const t0 = (min! - origin!) / velocity!, t1 = (max! - origin!) / velocity!;
        start = Math.max(start, Math.min(t0, t1)); end = Math.min(end, Math.max(t0, t1));
      }
      if (valid && end > start) intervals.push({ start, end, waterLevel: (c.y + d.y) / 2 });
    }
    intervals.sort((left, right) => left.start - right.start);
    const merged: typeof intervals = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval.start <= last.end + .001) { last.end = Math.max(last.end, interval.end); last.waterLevel = Math.min(last.waterLevel, interval.waterLevel); }
      else merged.push({ ...interval });
    }
    const at = (t: number): Vec3 => ({ x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t });
    for (const interval of merged) if ((interval.end - interval.start) * Math.hypot(dx, dz) >= 2) {
      result.push({ roadId: road.id, segment: i, a: at(interval.start), b: at(interval.end), width: road.width, waterLevel: interval.waterLevel });
    }
  }
  return result;
}

