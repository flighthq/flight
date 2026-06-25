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

// Canonical face indices into CubeTexture.faces, in the +X, -X, +Y, -Y, +Z, -Z cubemap order.
// Use these instead of magic-number indices when reading or writing a face.
export const CubeFacePositiveX = 0;
export const CubeFaceNegativeX = 1;
export const CubeFacePositiveY = 2;
export const CubeFaceNegativeY = 3;
export const CubeFacePositiveZ = 4;
export const CubeFaceNegativeZ = 5;
