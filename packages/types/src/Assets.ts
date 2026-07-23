import type { Signal } from './Signal';

// The @flighthq/assets header. An id-keyed asset library layered over @flighthq/loader (scheduling)
// and the per-resource decoders. The library owns keying, dedup, reference counting, manifests, and
// group preload; it decodes nothing itself. Callers bind each asset *type* to how it loads and how it
// frees through an open AssetLoaderAdapter registry, so the library depends on no concrete resource
// package and each app pays only for the types it registers.

// The type key for an asset — the registry key an AssetLoaderAdapter is registered under and the
// `type` field on an AssetDescriptor. An open string: the seeded names are the conventional resource
// vocabulary a user typically registers adapters for (assets ships no adapters and reserves no
// built-in types), while `(string & {})` keeps any custom, vendor-prefixed type accepted with
// autocomplete preserved for the seeds.
export type AssetType =
  | 'image'
  | 'font'
  | 'audio'
  | 'video'
  | 'textureAtlas'
  | 'tileset'
  | 'spritesheet'
  | (string & {});

// A plain-data manifest entry: the stable `id` callers acquire by, the `url` its adapter loads from,
// the `type` selecting which registered adapter loads it, and optional `groups` for batch preload.
// Groups are tags rather than entities: one asset may participate in several independently loaded
// groups without manufacturing group identity or lifecycle outside the owning AssetLibrary.
export interface AssetDescriptor {
  id: string;
  url: string;
  type: AssetType;
  groups?: readonly string[];
}

// A manifest is a plain array of descriptors. No file format is imposed here — parsing JSON or another
// on-disk manifest into this array is a separate, out-of-scope concern.
export type AssetManifest = readonly AssetDescriptor[];

// Binds one asset type to how it loads and how it frees. `load` produces the decoded resource for a
// descriptor (the library schedules and dedups the call); `dispose` frees that resource when the last
// holder releases it — the disposer chooses release-to-GC or destroy-a-resource per the asset kind.
// Registered under an AssetType via registerAssetLoader; the library itself supplies none.
export interface AssetLoaderAdapter<T = unknown> {
  load(descriptor: Readonly<AssetDescriptor>): Promise<T>;
  dispose(value: T): void;
}

// One cache entry for an acquired id: the loaded value (once resident), the live holder count, the
// in-flight load promise shared by concurrent acquires (null once settled), and whether `value` is
// loaded. Internal to the runtime; application code reads this state through getAsset/getAssetRefCount.
export interface AssetEntry {
  value: unknown;
  refcount: number;
  loadPromise: Promise<unknown> | null;
  resident: boolean;
}

// Opaque per-library runtime: the open adapter registry keyed by AssetType, the descriptor map keyed
// by id, the live cache entries keyed by id, and the group→member-ids index. Application code treats
// this as internal; it is read and written only by the @flighthq/assets functions.
export interface AssetLibraryRuntime {
  adapters: Map<AssetType, AssetLoaderAdapter>;
  descriptors: Map<string, AssetDescriptor>;
  entries: Map<string, AssetEntry>;
  groups: Map<string, string[]>;
}

// The id-keyed asset library entity. All state lives on the opaque runtime; create with
// createAssetLibrary, register per-type loaders with registerAssetLoader, declare assets with
// registerAssetDescriptor/registerAssetManifest, then acquire/release by id or preload by named group.
export interface AssetLibrary {
  runtime: AssetLibraryRuntime;
}

// Aggregate preload progress for loadAssetGroup: `loaded` members settled of `total` scheduled.
export interface AssetLoadProgress {
  loaded: number;
  total: number;
}

// Options for loadAssetGroup. `progress` is an opt-in signal emitted with an AssetLoadProgress each
// time a scheduled group member settles, composing the underlying loader's aggregate progress.
export interface AssetGroupLoadOptions {
  progress?: Signal<(progress: Readonly<AssetLoadProgress>) => void>;
}
