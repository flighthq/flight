import type { ImageResourceReference } from '@flighthq/image/contract';
import type { Texture } from '@flighthq/types/contract';

export function getTestTextureResource(
  resources: readonly ImageResourceReference[],
  texture: Readonly<Texture>,
): ImageResourceReference {
  const resource = resources.find((candidate) => candidate.textures?.includes(texture as Texture) === true);
  if (resource === undefined) throw new Error('texture is not associated with a scene resource');
  return resource;
}
