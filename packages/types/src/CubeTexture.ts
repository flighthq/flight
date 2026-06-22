import type { Entity, EntityWithoutRuntime } from './Entity';
import type { ImageResource } from './ImageResource';
import type { Sampler } from './Sampler';
import type { TextureColorSpace } from './Texture';

// A cubemap texture: six face images in the canonical +X, -X, +Y, -Y, +Z, -Z order, sharing
// one Sampler and color space. Consumed by environment lighting (skybox / IBL source). A face
// is null when unbound; a complete cube has all six set.
export interface CubeTexture extends Entity {
  colorSpace: TextureColorSpace;
  faces: readonly (ImageResource | null)[];
  sampler: Sampler;
}

export type CubeTextureLike = EntityWithoutRuntime<CubeTexture>;
