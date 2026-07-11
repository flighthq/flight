import { createResourceLoader, disposeResourceLoader, queueResourceLoad, startResourceLoad } from '@flighthq/loader';
import { connectSignal, emitSignal } from '@flighthq/signals';
import type {
  AssetEntry,
  AssetGroupLoadOptions,
  AssetLibrary,
  AssetLibraryRuntime,
  AssetLoaderAdapter,
  AssetManifest,
  AssetType,
} from '@flighthq/types';

// Increments the reference count for `id` and resolves its loaded value. If the asset is already
// resident, resolves immediately. If a load is already in flight (a concurrent acquire), the same
// promise is shared, so exactly one adapter.load runs per id (dedup). Otherwise the descriptor is
// resolved to its type's adapter and the load begins, storing the value at reference count one.
// Rejects (an async sentinel, not a throw) when no descriptor is recorded for the id or no adapter is
// registered for its type — the two misuse cases the library cannot recover from on its own.
export function acquireAsset<T = unknown>(library: Readonly<AssetLibrary>, id: string): Promise<T> {
  const runtime = library.runtime;
  const descriptor = runtime.descriptors.get(id);
  if (descriptor === undefined) {
    return Promise.reject(new Error(`assets: no descriptor for id "${id}" (loadAssetManifest first)`));
  }
  const adapter = runtime.adapters.get(descriptor.type);
  if (adapter === undefined) {
    return Promise.reject(new Error(`assets: no loader for type "${descriptor.type}" (registerAssetLoader first)`));
  }

  const existing = runtime.entries.get(id);
  if (existing !== undefined) {
    existing.refcount++;
    if (existing.resident) return Promise.resolve(existing.value as T);
    // A load is in flight — share it so only one adapter.load runs per id.
    return existing.loadPromise as Promise<T>;
  }

  const entry: AssetEntry = { value: undefined, refcount: 1, loadPromise: null, resident: false };
  runtime.entries.set(id, entry);
  const loadPromise = adapter.load(descriptor).then((value) => {
    if (runtime.entries.get(id) !== entry || entry.refcount <= 0) {
      // Released before the load settled — free the orphaned resource deterministically.
      adapter.dispose(value);
      return value;
    }
    entry.value = value;
    entry.resident = true;
    entry.loadPromise = null;
    return value;
  });
  entry.loadPromise = loadPromise;
  return loadPromise as Promise<T>;
}

// Allocates an empty asset library — an open adapter registry, an empty descriptor map, an empty cache,
// and an empty group index. Registers no adapters and knows how to load nothing until the caller opts
// in with registerAssetLoader.
export function createAssetLibrary(): AssetLibrary {
  const runtime: AssetLibraryRuntime = {
    adapters: new Map(),
    descriptors: new Map(),
    entries: new Map(),
    groups: new Map(),
  };
  return { runtime };
}

// Disposes every resident asset through its registered adapter and empties the library — adapters,
// descriptors, cache entries, and groups. Leaves the library reusable but stripped of all state.
export function disposeAssetLibrary(library: Readonly<AssetLibrary>): void {
  const runtime = library.runtime;
  for (const [id, entry] of runtime.entries) {
    if (!entry.resident) continue;
    const descriptor = runtime.descriptors.get(id);
    const adapter = descriptor !== undefined ? runtime.adapters.get(descriptor.type) : undefined;
    if (adapter !== undefined) adapter.dispose(entry.value);
  }
  runtime.adapters.clear();
  runtime.descriptors.clear();
  runtime.entries.clear();
  runtime.groups.clear();
}

// Returns the resident value for `id` synchronously, or null if it is not loaded (never acquired, or
// still loading). Never triggers a load — use acquireAsset for that.
export function getAsset<T = unknown>(library: Readonly<AssetLibrary>, id: string): T | null {
  const entry = library.runtime.entries.get(id);
  return entry !== undefined && entry.resident ? (entry.value as T) : null;
}

// Returns the live holder count for `id`: how many acquires have not yet been matched by a release.
// Zero for an id that was never acquired or has already been freed at reference count zero.
export function getAssetRefCount(library: Readonly<AssetLibrary>, id: string): number {
  const entry = library.runtime.entries.get(id);
  return entry !== undefined ? entry.refcount : 0;
}

// Preloads a named group through @flighthq/loader: every member that is not already resident is
// scheduled as a loader item (bounded concurrency, aggregate progress via options.progress), and every
// member is acquired (reference count incremented) so the whole group stays resident until
// releaseAssetGroup. Resolves once all scheduled loads settle. A group with no recorded members
// resolves immediately.
export async function loadAssetGroup(
  library: Readonly<AssetLibrary>,
  name: string,
  options?: Readonly<AssetGroupLoadOptions>,
): Promise<void> {
  const runtime = library.runtime;
  const ids = runtime.groups.get(name);
  if (ids === undefined || ids.length === 0) return;

  const loader = createResourceLoader();
  const progress = options?.progress;
  if (progress !== undefined) {
    connectSignal(loader.onProgress, (loaded: number, total: number) => {
      emitSignal(progress, { loaded, total });
    });
  }

  for (const id of ids) {
    const entry = runtime.entries.get(id);
    if (entry !== undefined && entry.resident) {
      // Already loaded — hold a group reference without scheduling a redundant load.
      void acquireAsset(library, id);
      continue;
    }
    // Route the actual load through the loader for bounded concurrency; acquireAsset dedups and holds
    // the group's reference.
    queueResourceLoad(loader, () => acquireAsset(library, id));
  }

  await new Promise<void>((resolve) => {
    connectSignal(loader.onComplete, () => resolve());
    startResourceLoad(loader);
  });
  disposeResourceLoader(loader);
}

// Records every descriptor's id → descriptor mapping and its group membership. Does not load anything —
// acquireAsset and loadAssetGroup perform the loads. Re-recording an id overwrites its descriptor.
export function loadAssetManifest(library: Readonly<AssetLibrary>, manifest: AssetManifest): void {
  const runtime = library.runtime;
  for (const descriptor of manifest) {
    runtime.descriptors.set(descriptor.id, descriptor);
    if (descriptor.group === undefined) continue;
    let members = runtime.groups.get(descriptor.group);
    if (members === undefined) {
      members = [];
      runtime.groups.set(descriptor.group, members);
    }
    if (!members.includes(descriptor.id)) members.push(descriptor.id);
  }
}

// Binds an asset type to how it loads and how it frees. The registry is open and last-write-wins, so a
// user adds their own (vendor-prefixed) types and can override a prior binding. The library depends on
// no resource package; the adapter is where a concrete decoder is wired in.
export function registerAssetLoader<T>(
  library: Readonly<AssetLibrary>,
  type: AssetType,
  adapter: Readonly<AssetLoaderAdapter<T>>,
): void {
  library.runtime.adapters.set(type, adapter as AssetLoaderAdapter);
}

// Decrements the reference count for `id`. When it reaches zero the asset is immediately disposed
// through its registered adapter and dropped from the cache (deterministic free). Releasing an id that
// is not held — never acquired, or already freed at zero — is a no-op.
export function releaseAsset(library: Readonly<AssetLibrary>, id: string): void {
  const runtime = library.runtime;
  const entry = runtime.entries.get(id);
  if (entry === undefined) return;
  entry.refcount--;
  if (entry.refcount > 0) return;
  disposeAssetEntry(runtime, id, entry);
}

// Releases the group reference held by loadAssetGroup for each member, mirroring the per-member acquire
// it performed. A member reaching reference count zero is disposed and dropped. A group with no
// recorded members is a no-op.
export function releaseAssetGroup(library: Readonly<AssetLibrary>, name: string): void {
  const ids = library.runtime.groups.get(name);
  if (ids === undefined) return;
  for (const id of ids) releaseAsset(library, id);
}

// Drops the cache entry and, when the asset actually decoded, frees it through its adapter. An entry
// whose load never settled (released mid-flight) has nothing decoded to free; the in-flight load's own
// continuation disposes the orphaned value once it resolves.
function disposeAssetEntry(runtime: AssetLibraryRuntime, id: string, entry: Readonly<AssetEntry>): void {
  runtime.entries.delete(id);
  if (!entry.resident) return;
  const descriptor = runtime.descriptors.get(id);
  const adapter = descriptor !== undefined ? runtime.adapters.get(descriptor.type) : undefined;
  if (adapter !== undefined) adapter.dispose(entry.value);
}
