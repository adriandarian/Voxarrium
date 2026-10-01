import { ResourceReferences } from '../assets/resource-references';
import type { DisposableResource } from '../assets/resource-references';
import type { TransitionHandle } from '../diagnostics/transition';

export interface PreparationResources {
  cache?: PreparationCache;
  transition?: TransitionHandle;
  own<T extends DisposableResource>(resource: T): T;
  release(resource: DisposableResource): void;
}
export function preparationResources(scope?: PreparationResources): PreparationResources {
  return scope ?? { own: resource => resource, release: resource => resource.dispose() };
}

/** A finite, renderer-owned immutable resource cache. Area leases still own their instance resources. */
export class PreparationCache {
  private readonly entries = new Map<string, { value: unknown; release: () => void; resources: Set<DisposableResource> }>();
  private hits = 0;
  private misses = 0;
  private disposed = false;
  constructor(private readonly references: ResourceReferences, readonly capacity = 192) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 256) throw new Error('Preparation cache capacity must be 1..256.');
  }
  get<T>(key: string): T | undefined {
    if (this.disposed) throw new Error('Preparation cache is disposed.');
    const entry = this.entries.get(key);
    if (entry) this.hits++; else this.misses++;
    return entry?.value as T | undefined;
  }
  retain<T>(key: string, value: T, resources: Iterable<DisposableResource>): T {
    if (this.disposed) throw new Error('Preparation cache is disposed.');
    if (this.entries.has(key)) throw new Error(`Duplicate preparation cache key ${key}`);
    if (this.entries.size >= this.capacity) throw new Error('Finite preparation cache capacity exceeded.');
    const unique = new Set(resources);
    this.entries.set(key, { value, release: this.references.acquire(unique), resources: unique });
    return value;
  }
  snapshot() {
    const unique = new Set([...this.entries.values()].flatMap(entry => [...entry.resources]));
    const references = [...this.entries.values()].reduce((n, entry) => n + entry.resources.size, 0);
    const liveReferences = [...unique].reduce((n, resource) => n + this.references.referenceCount(resource), 0);
    return { entries: this.entries.size, capacity: this.capacity, resources: unique.size, references,
      instanceReferences: Math.max(0, liveReferences - references),
      hits: this.hits, misses: this.misses, disposed: this.disposed };
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    const failures: unknown[] = [];
    for (const entry of this.entries.values()) { try { entry.release(); } catch (error) { failures.push(error); } }
    this.entries.clear();
    if (failures.length) throw new AggregateError(failures, 'Preparation cache disposal failed');
  }
}
