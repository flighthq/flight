import type {
  ImageResourceReference,
  ImageResourceReferenceResolutionExplanation,
  Scene3D,
  Scene3DResourceResolver,
  Texture,
  UpdateScene3DResourceStreamingOptions,
} from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';

import { getScene3DResourceTextures, getScene3DTextureResourceReference } from './getScene3DResourceTextures';
import { updateScene3DResourceStreaming } from './resolveScene3DResources';

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

// Resets every selected failed identity once, then performs a streaming update under the same
// selection/priority policy. The update remains authoritative for the working set, including cancellation
// when visibility selection drops an existing subscriber.
export function retryFailedScene3DResources(
  scene: Readonly<Scene3D>,
  resolver: Scene3DResourceResolver,
  options?: Readonly<UpdateScene3DResourceStreamingOptions>,
): number {
  const textures: Texture[] = [];
  getScene3DResourceTextures(scene, resolver.registry, textures);
  const reset = new Set<ImageResourceReference>();
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    const ref = getScene3DTextureResourceReference(scene, texture);
    if (ref == null || reset.has(ref)) continue;
    if (options?.select !== undefined && !options.select(texture, ref)) continue;
    if (resetFailedImageResourceReference(ref)) reset.add(ref);
  }
  updateScene3DResourceStreaming(scene, resolver, options);
  return reset.size;
}
