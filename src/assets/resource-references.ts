export interface DisposableResource { dispose(): void }

/** Leases own resource disposal. This is reference accounting, not an asset cache. */
export class ResourceReferences {
  private readonly references = new Map<DisposableResource, number>();
  private readonly disposed = new WeakSet<DisposableResource>();

  acquire(resources: Iterable<DisposableResource>): () => void {
    const lease = new Set(resources);
    for (const resource of lease) {
      if (this.disposed.has(resource)) throw new Error('Cannot acquire a disposed resource.');
    }
    for (const resource of lease) this.references.set(resource, (this.references.get(resource) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const failures: unknown[] = [];
      for (const resource of lease) {
        const count = this.references.get(resource)!;
        if (count > 1) this.references.set(resource, count - 1);
        else {
          this.references.delete(resource);
          this.disposed.add(resource);
          try { resource.dispose(); } catch (error) { failures.push(error); }
        }
      }
      lease.clear();
      if (failures.length) throw new AggregateError(failures, 'Resource disposal failed.');
    };
  }

  snapshot() {
    const byType: Record<string, number> = {};
    let references = 0;
    for (const [resource, count] of this.references) {
      references += count;
      const name = resource.constructor.name || 'Resource';
      byType[name] = (byType[name] ?? 0) + 1;
    }
    return { resources: this.references.size, references,
      byType: Object.fromEntries(Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) };
  }

  /** Read-only identity accounting for the finite immutable preparation cache. */
  referenceCount(resource: DisposableResource) { return this.references.get(resource) ?? 0; }
}

/** Stable manifest identities are tracked independently of render objects. */
export class AssetReferences {
  private readonly references = new Map<string, number>();

  acquire(ids: Iterable<string>): () => void {
    const lease = new Set(ids);
    for (const id of lease) this.references.set(id, (this.references.get(id) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const id of lease) {
        const count = this.references.get(id)!;
        if (count > 1) this.references.set(id, count - 1);
        else this.references.delete(id);
      }
      lease.clear();
    };
  }

  snapshot() {
    const ids = Object.fromEntries([...this.references].sort(([a], [b]) => a.localeCompare(b)));
    return { assets: this.references.size,
      references: [...this.references.values()].reduce((sum, count) => sum + count, 0), ids };
  }
}
