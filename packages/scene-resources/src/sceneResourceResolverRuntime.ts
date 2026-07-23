import type {
  ImageResource,
  ImageResourceReference,
  ResourceLoader,
  SceneResourceResolver,
  SceneResourceSignals,
  Texture,
} from '@flighthq/types';

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
