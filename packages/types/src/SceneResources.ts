import type { EasingFunction } from './EasingFunction';
import type { Entity, Kind } from './Entity';
import type { ImageResource } from './ImageResource';
import type { ExternalImageResourceReference, ImageResourceReference } from './ImageResourceReference';
import type { Material } from './Material';
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

export interface LoadSceneOptions {
  resolver?: SceneResourceResolver;
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
