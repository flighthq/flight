import { resetFailedImageResourceReference } from '@flighthq/image/contract';
import type {
  ImageResourceReference,
  Scene3D,
  Scene3DResourceResolverWithRuntime,
  Texture,
  UpdateScene3DResourceStreamingOptions,
} from '@flighthq/types/contract';

import { getScene3DResourceTextures, getScene3DTextureResourceReference } from './getScene3DResourceTextures';
import { updateScene3DResourceStreaming } from './resolveScene3DResources';

// Resets every selected failed identity once, then performs a streaming update under the same
// selection/priority policy. The update remains authoritative for the working set, including cancellation
// when visibility selection drops an existing subscriber.
export function retryFailedScene3DResources(
  scene: Readonly<Scene3D>,
  resolver: Scene3DResourceResolverWithRuntime,
  options?: Readonly<UpdateScene3DResourceStreamingOptions>,
): number {
  const textures: Texture[] = [];
  getScene3DResourceTextures(textures, scene);
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
