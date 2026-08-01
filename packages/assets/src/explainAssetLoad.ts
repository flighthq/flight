import type { AssetLibrary, AssetLoadExplanation } from '@flighthq/types/contract';

// Reports the id's catalog, adapter, and residency state without initiating work. This is the pull
// diagnostic for getAsset's null sentinel and getAssetRefCount's zero sentinel.
export function explainAssetLoad(library: Readonly<AssetLibrary>, id: string): AssetLoadExplanation {
  const runtime = library.runtime;
  const descriptor = runtime.descriptors.get(id);
  if (descriptor === undefined) return { id, refCount: 0, status: 'missing-descriptor', type: null };

  const type = descriptor.type;
  if (!runtime.adapters.has(type)) return { id, refCount: 0, status: 'missing-loader', type };

  const entry = runtime.entries.get(id);
  if (entry !== undefined) {
    return {
      id,
      refCount: entry.refcount,
      status: entry.resident ? 'resident' : 'loading',
      type,
    };
  }

  return {
    id,
    refCount: 0,
    status: runtime.freedIds.has(id) ? 'freed' : 'never-acquired',
    type,
  };
}
