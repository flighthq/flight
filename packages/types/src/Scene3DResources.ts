import type { EasingFunction } from './EasingFunction';
import type { Entity, Kind } from './Entity';
import type { GltfExtensionHandler } from './GltfExtension';
import type { ImageResourceFetch, ImageResourceReference } from './ImageResourceReference';
import type { ImportDiagnostic } from './ImportDiagnostic';
import type { Material } from './Material';
import type { PbrExtension } from './PbrExtension';
import type { ResourceLoader } from './ResourceLoader';
import type { Scene3D } from './Scene3D';
import type { Signal } from './Signal';
import type { Texture } from './Texture';
import type { TextureSource } from './TextureSource';

export type Scene3DMaterialTextureLister = (material: Readonly<Material>, out: Texture[]) => void;

export type Scene3DPbrExtensionTextureLister = (extension: Readonly<PbrExtension>, out: Texture[]) => void;

export interface Scene3DMaterialTextureRegistry extends Entity {
  extensionListers: Map<Kind, Scene3DPbrExtensionTextureLister>;
  listers: Map<Kind, Scene3DMaterialTextureLister>;
}

export interface Scene3DResourceEvent {
  ref: ImageResourceReference;
  texture: Texture;
}

export interface Scene3DResourceSignals extends Entity {
  onResourceFailed: Signal<(event: Readonly<Scene3DResourceEvent>) => void>;
  onResourceResolved: Signal<(event: Readonly<Scene3DResourceEvent>) => void>;
}

// The public, caller-composable resolver atom. Queueing, settled-source retention, subscribers, and
// optional signals are package-private runtime state: callers select the fetch and texture-discovery
// seams, then advance/query the resolver through named functions rather than mutating its machinery.
export interface Scene3DResourceResolver extends Entity {
  fetch: ImageResourceFetch;
  registry: Scene3DMaterialTextureRegistry;
}

export interface Scene3DResourceResolverOptions {
  fetch?: ImageResourceFetch;
  maxConcurrent?: number;
  registry?: Scene3DMaterialTextureRegistry;
}

// One resource identity's private in-flight resolution. Several sampled Texture entities may share
// one image resource while retaining independent sampler/color/UV state.
export interface Scene3DResourceInFlight {
  controller: AbortController;
  promise: Promise<void>;
  subscribers: Set<Texture>;
}

export interface Scene3DResourceResolverRuntime {
  inFlight: Map<ImageResourceReference, Scene3DResourceInFlight>;
  loader: ResourceLoader;
  resolved: Map<ImageResourceReference, TextureSource>;
  signals: Scene3DResourceSignals | null;
}

export const Scene3DResourceResolverRuntimeKey: unique symbol = Symbol('Scene3DResourceResolverRuntime');

export interface Scene3DResourceResolverWithRuntime extends Scene3DResourceResolver {
  [Scene3DResourceResolverRuntimeKey]: Scene3DResourceResolverRuntime;
}

// One byte-progress tick for a source participating in asynchronous Scene3DDocument acquisition. The URL
// identifies the main file or discovered dependency; totals are per source and may be zero when the
// transport cannot determine Content-Length.
export interface Scene3DDocumentLoadProgress {
  loaded: number;
  phase: 'download' | 'upload';
  total: number;
  url: string;
}

export interface Scene3DDocumentLoadOptions {
  progress?: Signal<(progress: Readonly<Scene3DDocumentLoadProgress>) => void>;
  signal?: AbortSignal;
}

// glTF URL acquisition plus the caller-owned synchronous parser opt-ins. Diagnostics report unsupported
// required extensions, while an unhandled extension named only in `extensionsUsed` remains silent.
export interface GltfScene3DDocumentLoadOptions extends Scene3DDocumentLoadOptions {
  diagnostics?: ImportDiagnostic[];
  extensionHandlers?: readonly GltfExtensionHandler[];
}

export interface Scene3DResourceLoadProgress {
  loaded: number;
  total: number;
}

export interface LoadScene3DResourcesOptions extends UpdateScene3DResourceStreamingOptions {
  progress?: Signal<(progress: Readonly<Scene3DResourceLoadProgress>) => void>;
}

export interface ResolveScene3DResourcesOptions {
  select?: (texture: Readonly<Texture>, ref: Readonly<ImageResourceReference>) => boolean;
}

export interface Scene3DResourceResolution extends Scene3DResourceWorkingSet {
  source: TextureSource;
}

// One synchronous selected-working-set snapshot. Resolved groups name the ready source and every Texture
// subscriber it was bound to; unresolved groups remain directly usable by loading/streaming policy.
export interface Scene3DResources {
  resolved: Scene3DResourceResolution[];
  scene: Scene3D;
  unresolved: Scene3DResourceWorkingSet[];
}

export interface Scene3DResourceWorkingSet {
  ref: ImageResourceReference;
  textures: Texture[];
}

export interface UpdateScene3DResourceStreamingOptions extends ResolveScene3DResourcesOptions {
  priority?: (texture: Readonly<Texture>, ref: Readonly<ImageResourceReference>) => number;
}

export interface Scene3DResourceRevealOptions {
  ease?: EasingFunction;
  fadeSeconds?: number;
  from?: number;
}
