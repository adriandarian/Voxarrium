import { areaDistance, STREAMING_POLICY } from './streaming-contracts';
import type { AreaHandle, AreaId, StreamingAdapter, StreamingPolicy, WorldArea } from './streaming-contracts';
import type { Vec3 } from './types';

export type AreaLifecycleState = 'unloaded' | 'requested' | 'preparing' | 'warming' | 'ready' | 'active' | 'inactive' | 'failed';
const preparing = (state: AreaLifecycleState) => state === 'requested' || state === 'preparing' || state === 'warming';
export interface StreamingEvent {
  areaId: AreaId;
  type: 'load-start' | 'load-complete' | 'load-cancel' | 'load-error' | 'activate' | 'deactivate' | 'unload' | 'late-release' | 'adapter-error';
  time: number;
  epoch: number;
  durationMs?: number;
  message?: string;
  successful?: boolean;
}
interface Entry {
  area: WorldArea;
  state: AreaLifecycleState;
  distance: number;
  demandDistance: number;
  holdWhileStationary?: boolean;
  outsideSeconds: number;
  epoch: number;
  handle?: AreaHandle;
  abort?: AbortController;
  pending?: Promise<void>;
  /** Keep one transport per area even if cancellation is ignored. */
  transport?: Promise<void>;
  error?: string;
}
export interface StreamingController {
  update(position: Vec3, dt: number, velocity?: Vec3, demandIds?: readonly AreaId[]): void;
  /** Startup prepares only the known first neighbor. Movement returns to the
   * normal predictive demand/cancellation/hysteresis policy. */
  preload(id: AreaId): void;
  /** Await currently relevant loads; a canceled transport may finish later. */
  settled(): Promise<void>;
  ready(id: AreaId): boolean;
  loadedIds(): AreaId[];
  activeIds(): AreaId[];
  snapshot(): {
    disposed: boolean;
    policy: StreamingPolicy;
    areas: { id: AreaId; state: AreaLifecycleState; distance: number | null; outsideSeconds: number; loadEpoch: number; error: string | null }[];
    loadedIds: AreaId[];
    activeIds: AreaId[];
    pendingIds: AreaId[];
    retiringIds: AreaId[];
    events: StreamingEvent[];
    errors: StreamingEvent[];
    counts: { loads: number; cancellations: number; activations: number; deactivations: number; unloads: number; lateReleases: number; failures: number };
  };
  dispose(): void;
}

/** One lifecycle chunk for each of the three bounded authored areas.
 * The adapter prepares off-scene and owns all render/collider/environment cleanup.
 * Its activate method must install colliders before making geometry visible.
 */
export function createStreamingController(areas: readonly WorldArea[], adapter: StreamingAdapter,
  options: Partial<StreamingPolicy> = {}): StreamingController {
  const cityGraph = areas.length >= 10 && areas.length <= 16 && areas.every(area => area.neighbors && area.footprint);
  if ((!cityGraph && areas.length !== 3) || new Set(areas.map(area => area.id)).size !== areas.length ||
      !['rural', 'river-market', 'neighbor-shell'].every(id => areas.some(area => area.id === id))) {
    throw new Error('M5 requires exactly rural, river-market and neighbor-shell areas.');
  }
  if (cityGraph && areas.some(area => area.neighbors!.some(id => !areas.some(neighbor => neighbor.id === id && neighbor.neighbors!.includes(area.id))))) {
    throw new Error('City streaming adjacency must reference reciprocal existing districts.');
  }
  if (cityGraph) {
    const visited = new Set<AreaId>();
    const queue = [areas[0]!.id];
    while (queue.length) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id); queue.push(...areas.find(area => area.id === id)!.neighbors!);
    }
    if (visited.size !== areas.length) throw new Error('City streaming graph must be connected.');
  }
  const policy = { ...STREAMING_POLICY, ...options };
  if (!Object.values(policy).every(value => Number.isFinite(value) && value >= 0) ||
      policy.preloadRadius >= policy.deactivateRadius || policy.deactivateRadius >= policy.unloadRadius) {
    throw new Error('Streaming radii require preload < deactivate < unload and finite nonnegative values.');
  }
  const entries: Entry[] = areas.map(area => ({ area, state: 'unloaded', distance: Infinity, demandDistance: Infinity, outsideSeconds: 0, epoch: 0 }));
  const events: StreamingEvent[] = [];
  const errors: StreamingEvent[] = [];
  const counts = { loads: 0, cancellations: 0, activations: 0, deactivations: 0, unloads: 0, lateReleases: 0, failures: 0 };
  let disposed = false;
  const message = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  function record(entry: Entry, type: StreamingEvent['type'], details: Pick<StreamingEvent, 'durationMs' | 'message' | 'successful'> = {}, epoch = entry.epoch) {
    const event: StreamingEvent = { areaId: entry.area.id, type, time: performance.now(), epoch, ...details };
    events.push(event);
    if (events.length > 256) events.shift();
    if (type === 'load-error' || type === 'adapter-error') {
      errors.push(event);
      if (errors.length > 256) errors.shift();
      counts.failures++;
    }
  }
  function adapterError(entry: Entry, error: unknown) {
    entry.error = message(error);
    record(entry, 'adapter-error', { message: entry.error });
  }
  function release(entry: Entry, handle: AreaHandle, late = false, epoch = entry.epoch) {
    const start = performance.now();
    let successful = true;
    try { handle.unload(); } catch (error) { successful = false; adapterError(entry, error); }
    if (late) counts.lateReleases++;
    else counts.unloads++;
    record(entry, late ? 'late-release' : 'unload', { durationMs: performance.now() - start, successful }, epoch);
  }
  function cancel(entry: Entry) {
    if (!entry.abort) return;
    const epoch = entry.epoch;
    const abort = entry.abort;
    // Invalidate before abort: even an abort-ignoring load cannot install itself.
    entry.epoch++;
    entry.abort = undefined;
    entry.pending = undefined;
    entry.state = 'unloaded';
    counts.cancellations++;
    record(entry, 'load-cancel', {}, epoch);
    abort.abort();
  }
  function deactivate(entry: Entry) {
    if (entry.state !== 'active' || !entry.handle) return;
    try { entry.handle.deactivate(); } catch (error) {
      adapterError(entry, error);
      const handle = entry.handle;
      entry.handle = undefined;
      release(entry, handle);
      entry.state = 'failed';
      return;
    }
    entry.state = 'inactive';
    counts.deactivations++;
    record(entry, 'deactivate');
  }
  function unload(entry: Entry) {
    deactivate(entry);
    if (entry.handle) {
      const handle = entry.handle;
      entry.handle = undefined;
      release(entry, handle);
    }
    entry.state = 'unloaded';
    entry.outsideSeconds = 0;
  }
  function activate(entry: Entry) {
    if (!entry.handle || entry.state === 'active') return;
    try {
      entry.handle.activate();
      entry.state = 'active';
      counts.activations++;
      record(entry, 'activate');
    } catch (error) {
      adapterError(entry, error);
      // Activation may have partially installed resources; unload must own that cleanup.
      unload(entry);
      entry.state = 'failed';
    }
  }
  function load(entry: Entry) {
    const abort = new AbortController();
    const epoch = ++entry.epoch;
    const start = performance.now();
    entry.abort = abort;
    entry.state = 'requested';
    entry.error = undefined;
    counts.loads++;
    record(entry, 'load-start');
    // The microtask also turns synchronous adapter exceptions into handled rejections.
    const pending = Promise.resolve().then(() => {
      if (abort.signal.aborted) throw new DOMException('Area preparation was canceled.', 'AbortError');
      entry.state = 'preparing';
      return adapter.load(entry.area, abort.signal, phase => {
        if (!disposed && entry.epoch === epoch && !abort.signal.aborted) entry.state = phase;
      });
    }).then(handle => {
      const durationMs = performance.now() - start;
      if (disposed || entry.epoch !== epoch || abort.signal.aborted) {
        release(entry, handle, true, epoch);
        return;
      }
      entry.handle = handle;
      entry.state = 'ready';
      record(entry, 'load-complete', { durationMs });
      if (entry.distance <= policy.deactivateRadius) activate(entry);
    }).catch(error => {
      if (disposed || entry.epoch !== epoch || abort.signal.aborted) return;
      entry.error = message(error);
      entry.state = 'failed';
      record(entry, 'load-error', { durationMs: performance.now() - start, message: entry.error });
    }).finally(() => {
      if (entry.epoch === epoch) {
        entry.abort = undefined;
        entry.pending = undefined;
      }
      if (entry.transport === pending) entry.transport = undefined;
      if (!disposed && entry.state === 'unloaded' && entry.demandDistance <= policy.preloadRadius && hasSlot()) load(entry);
    });
    entry.pending = pending;
    entry.transport = pending;
  }
  const loadedIds = () => entries.filter(entry => entry.handle).map(entry => entry.area.id);
  const activeIds = () => entries.filter(entry => entry.state === 'active').map(entry => entry.area.id);
  // Predictive preparation still admits only two area instances/transports.
  // The third waits for the outgoing lease's normal hysteretic unload.
  const hasSlot = () => (!cityGraph && policy.preparationLeadSeconds === 0) || entries.filter(entry => entry.handle || entry.transport).length < 2;
  return {
    preload(id) {
      const entry = entries.find(entry => entry.area.id === id);
      if (disposed || !entry || entry.handle || entry.transport || !hasSlot()) return;
      entry.holdWhileStationary = true; entry.demandDistance = 0;
      load(entry);
    },
    update(position, dt, velocity = { x: 0, y: 0, z: 0 }, demandIds) {
      if (disposed) return;
      if (![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z, dt].every(Number.isFinite) || dt < 0) {
        throw new Error('Streaming update requires a finite position and nonnegative elapsed seconds.');
      }
      // Authored city demand selects a current district and one route neighbor,
      // adding graph departure at close forks. The same cancellation, two-lease
      // transport bound and continuous departure timer remain authoritative.
      for (const entry of entries) {
        const graphDeparture = !!(cityGraph && demandIds && !demandIds.includes(entry.area.id));
        entry.distance = areaDistance(entry.area, position);
        const projected = entry.area.assetIds.length || cityGraph ? { x: position.x + velocity.x * policy.preparationLeadSeconds,
          y: position.y, z: position.z + velocity.z * policy.preparationLeadSeconds } : position;
        if (Math.hypot(velocity.x, velocity.z) > .01) entry.holdWhileStationary = false;
        entry.demandDistance = demandIds && !demandIds.includes(entry.area.id) ? Infinity :
          entry.holdWhileStationary ? 0 : Math.min(entry.distance, areaDistance(entry.area, projected));
        // M8's authored road arbitration already selects exactly one connected
        // neighbor. A bent approach/local loop must not cancel that chosen cold
        // load just because its straight projection temporarily misses the
        // radial band. Admission still uses the same two transports/instances.
        // First cold startup initializes shared landscape resources before its
        // known neighbor prepares. Thereafter movement follows authored roads,
        // and an ongoing load survives short idle readbacks. A ready, distant
        // neighbor still retires under the ordinary stationary departure policy.
        if(entry.area.preloadApproaches&&demandIds?.includes(entry.area.id)&&
          (Math.hypot(velocity.x,velocity.z)>.1||preparing(entry.state))&&
          entries.some(current=>current.area.id===demandIds[0]&&current.handle))
          entry.demandDistance=Math.min(entry.demandDistance,policy.preloadRadius);
        entry.outsideSeconds = graphDeparture || entry.distance > policy.unloadRadius && entry.demandDistance > policy.preloadRadius ? entry.outsideSeconds + dt : 0;
        if (preparing(entry.state) && (graphDeparture || entry.distance > policy.deactivateRadius && entry.demandDistance > policy.preloadRadius)) cancel(entry);
        if (entry.state === 'active' && (graphDeparture || entry.distance > policy.deactivateRadius)) deactivate(entry);
        if (entry.outsideSeconds >= policy.unloadDelaySeconds && (graphDeparture || entry.distance > policy.unloadRadius)) {
          if (entry.handle) unload(entry);
          // A failed area gets one retry only after a true departure and re-entry.
          else if (entry.state === 'failed') { entry.state = 'unloaded'; entry.outsideSeconds = 0; }
        }
        if (entry.demandDistance <= policy.preloadRadius) {
          if (entry.state === 'unloaded' && !entry.transport && hasSlot()) load(entry);
          else if (entry.distance <= policy.preloadRadius && (entry.state === 'inactive' || entry.state === 'ready')) activate(entry);
        }
      }
    },
    async settled() {
      // A new relevant load can start while awaiting an earlier one.
      for (;;) {
        const pending = entries.flatMap(entry => entry.pending ? [entry.pending] :
          entry.state === 'unloaded' && entry.demandDistance <= policy.preloadRadius && entry.transport ? [entry.transport] : []);
        if (!pending.length) return;
        await Promise.all(pending);
      }
    },
    ready(id) { return entries.some(entry => entry.area.id === id && !!entry.handle); },
    loadedIds,
    activeIds,
    snapshot() {
      return { disposed, policy: { ...policy },
        areas: entries.map(entry => ({ id: entry.area.id, state: entry.state,
          distance: Number.isFinite(entry.distance) ? entry.distance : null,
          outsideSeconds: entry.outsideSeconds, loadEpoch: entry.epoch, error: entry.error ?? null })),
        loadedIds: loadedIds(), activeIds: activeIds(),
        pendingIds: entries.filter(entry => entry.pending).map(entry => entry.area.id),
        retiringIds: entries.filter(entry => entry.transport && !entry.pending).map(entry => entry.area.id),
        events: events.map(event => ({ ...event })), errors: errors.map(event => ({ ...event })), counts: { ...counts } };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries) { cancel(entry); unload(entry); }
    },
  };
}
