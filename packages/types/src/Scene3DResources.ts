// Owned by `@flighthq/scene3d-resources`. These deprecated re-exports keep existing `@flighthq/types`
// imports compiling until consumers import the owning package.

import type { Scene3DResourceResolverRuntimeKey as OwnedScene3DResourceResolverRuntimeKey } from '@flighthq/scene3d-resources/contract';

/** @deprecated Import from `@flighthq/scene3d-resources/contract`. */
export type {
  GltfScene3DDocumentLoadOptions,
  LoadScene3DResourcesOptions,
  ResolveScene3DResourcesOptions,
  Scene3DDocumentLoadOptions,
  Scene3DDocumentLoadProgress,
  Scene3DMaterialTextureLister,
  Scene3DMaterialTextureRegistry,
  Scene3DPbrExtensionTextureLister,
  Scene3DResourceEvent,
  Scene3DResourceInFlight,
  Scene3DResourceLoadProgress,
  Scene3DResourceResolution,
  Scene3DResourceResolver,
  Scene3DResourceResolverOptions,
  Scene3DResourceResolverRuntime,
  Scene3DResourceResolverWithRuntime,
  Scene3DResourceRevealOptions,
  Scene3DResourceSignals,
  Scene3DResourceWorkingSet,
  Scene3DResources,
  UpdateScene3DResourceStreamingOptions,
} from '@flighthq/scene3d-resources/contract';

// A structural copy (core may cross into an owner only with type-only edges). The registered symbol
// makes it the very same value as the owner's key, and the cast gives it the owner's unique type.
/** @deprecated Import from `@flighthq/scene3d-resources/contract`. */
export const Scene3DResourceResolverRuntimeKey = Symbol.for(
  '@flighthq/scene3d-resources/Scene3DResourceResolverRuntime',
) as typeof OwnedScene3DResourceResolverRuntimeKey;
