import type {
  ImageResourceReference,
  ImageResourceReferenceResolutionExplanation,
  ResolveSceneResourcesOptions,
  SceneNode,
  SceneResourceResolver,
  Texture,
} from '@flighthq/types';
import { ResourceResolutionState } from '@flighthq/types';

import { getSceneResourceTextures } from './getSceneResourceTextures';
import { resolveSceneResources } from './resolveSceneResources';

// Returns a detached plain-data explanation suitable for logs, tools, and serialization. It never
// throws and exposes no resolver runtime or raw thrown value.
export function explainImageResourceReferenceResolution(
  ref: Readonly<ImageResourceReference>,
): ImageResourceReferenceResolutionExplanation {
  return {
    failure: ref.failure === null ? null : { ...ref.failure },
    kind: ref.kind,
    retryable: ref.state === ResourceResolutionState.Failed,
    state: ref.state,
  };
}

// Returns a failed reference to the requestable state. Loading/resolved/unresolved references are
// unchanged so this atom cannot invalidate live work or a successfully bound resource accidentally.
export function resetFailedImageResourceReference(ref: ImageResourceReference): boolean {
  if (ref.state !== ResourceResolutionState.Failed) return false;
  ref.failure = null;
  ref.state = ResourceResolutionState.Unresolved;
  return true;
}

// Resets every selected failed identity once, then performs a normal resolver pass under the same
// selection/priority policy. The normal pass remains authoritative for the working set, including its
// documented cancellation behavior when visibility selection drops an existing subscriber.
export function retryFailedSceneResources(
  scene: Readonly<SceneNode>,
  resolver: SceneResourceResolver,
  options?: Readonly<ResolveSceneResourcesOptions>,
): number {
  const textures: Texture[] = [];
  getSceneResourceTextures(scene, resolver.registry, textures);
  const reset = new Set<ImageResourceReference>();
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    const ref = texture.resource;
    if (ref == null || reset.has(ref)) continue;
    if (options?.select !== undefined && !options.select(texture, ref)) continue;
    if (resetFailedImageResourceReference(ref)) reset.add(ref);
  }
  resolveSceneResources(scene, resolver, options);
  return reset.size;
}
