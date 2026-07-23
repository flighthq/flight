import type { EasingFunction } from './EasingFunction';
import type { Entity, Kind } from './Entity';
import type { ImageResource } from './ImageResource';
import type { ExternalImageResourceReference, ImageResourceReference } from './ImageResourceReference';
import type { Material } from './Material';
import type { ResourceLoader } from './ResourceLoader';
import type { Signal } from './Signal';
import type { Texture } from './Texture';

export type ImageResourceFetch = (
  ref: Readonly<ExternalImageResourceReference>,
  signal: AbortSignal,
) => Promise<ImageResource | null>;

export type SceneMaterialTextureLister = (material: Readonly<Material>, out: Texture[]) => void;

export interface SceneMaterialTextureRegistry extends Entity {
  listers: Map<Kind, SceneMaterialTextureLister>;
}

export interface SceneResourceEvent {
  ref: ImageResourceReference;
  texture: Texture;
}

export interface SceneResourceSignals extends Entity {
  onResourceFailed: Signal<(event: Readonly<SceneResourceEvent>) => void>;
  onResourceResolved: Signal<(event: Readonly<SceneResourceEvent>) => void>;
}

// The public, caller-composable resolver atom. Queueing, settled-image retention, subscribers, and
// optional signals are package-private runtime state: callers select the fetch and texture-discovery
// seams, then advance/query the resolver through named functions rather than mutating its machinery.
export interface SceneResourceResolver extends Entity {
  fetch: ImageResourceFetch;
  registry: SceneMaterialTextureRegistry;
}

export interface SceneResourceResolverOptions {
  fetch?: ImageResourceFetch;
  maxConcurrent?: number;
  registry?: SceneMaterialTextureRegistry;
}

// One resource identity's private in-flight resolution. Several sampled Texture entities may share
// one image resource while retaining independent sampler/color/UV state.
export interface SceneResourceInFlight {
  controller: AbortController;
  promise: Promise<void>;
  subscribers: Set<Texture>;
}

export interface SceneResourceResolverRuntime {
  inFlight: Map<ImageResourceReference, SceneResourceInFlight>;
  loader: ResourceLoader;
  resolved: Map<ImageResourceReference, ImageResource>;
  signals: SceneResourceSignals | null;
}

export const SceneResourceResolverRuntimeKey: unique symbol = Symbol('SceneResourceResolverRuntime');

export type SceneResourceResolverWithRuntime = SceneResourceResolver & {
  [SceneResourceResolverRuntimeKey]: SceneResourceResolverRuntime;
};

// One byte-progress tick for a source participating in asynchronous SceneDocument acquisition. The URL
// identifies the main file or discovered dependency; totals are per source and may be zero when the
// transport cannot determine Content-Length.
export interface SceneDocumentLoadProgress {
  loaded: number;
  phase: 'download' | 'upload';
  total: number;
  url: string;
}

export interface SceneDocumentLoadOptions {
  progress?: Signal<(progress: Readonly<SceneDocumentLoadProgress>) => void>;
  signal?: AbortSignal;
}

export interface SceneResourceLoadProgress {
  loaded: number;
  total: number;
}

export interface LoadSceneResourcesOptions extends ResolveSceneResourcesOptions {
  progress?: Signal<(progress: Readonly<SceneResourceLoadProgress>) => void>;
}

export interface ResolveSceneResourcesOptions {
  priority?: (texture: Readonly<Texture>, ref: Readonly<ImageResourceReference>) => number;
  select?: (texture: Readonly<Texture>, ref: Readonly<ImageResourceReference>) => boolean;
}

export interface SceneResourceRevealOptions {
  ease?: EasingFunction;
  fadeSeconds?: number;
  from?: number;
}
