import { createEntity } from '@flighthq/entity';
import { cloneVector2, copyVector2, createVector2 } from '@flighthq/geometry';
import type { ImageResource, Texture, TextureLike } from '@flighthq/types';

import { cloneSampler, copySampler, createSampler } from './sampler';

// Allocates an independent Texture over the SAME image pixels: the ImageResource reference is
// shared (clone the resource separately to upload into a second render state), while the Sampler
// and the uv-transform vectors are deep-cloned so the two textures can be sampled independently.
export function cloneTexture(source: Readonly<TextureLike>): Texture {
  return createEntity({
    colorSpace: source.colorSpace,
    image: source.image,
    sampler: cloneSampler(source.sampler),
    uvOffset: cloneVector2(source.uvOffset),
    uvRotation: source.uvRotation,
    uvScale: cloneVector2(source.uvScale),
  });
}

// Copies every Texture field from source into out in place. The image reference is shared; the
// Sampler and uv-transform vectors are copied into out's existing entities (their identities are
// preserved). Safe when out aliases source.
export function copyTexture(out: TextureLike, source: Readonly<TextureLike>): void {
  const colorSpace = source.colorSpace;
  const image = source.image;
  const uvRotation = source.uvRotation;
  copySampler(out.sampler, source.sampler);
  copyVector2(out.uvOffset, source.uvOffset);
  copyVector2(out.uvScale, source.uvScale);
  out.colorSpace = colorSpace;
  out.image = image;
  out.uvRotation = uvRotation;
}

// Builds a Texture: an unbound image slot (null), a default Sampler, 'srgb' color space (the
// albedo default — data maps override to 'linear'), and an identity KHR_texture_transform
// (zero offset, unit scale, no rotation). Pass TextureLike fields to override any of these.
export function createTexture(opts?: Readonly<Partial<TextureLike>>): Texture {
  return createEntity({
    colorSpace: opts?.colorSpace ?? 'srgb',
    image: opts?.image ?? null,
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : createSampler(),
    uvOffset: opts?.uvOffset ? cloneVector2(opts.uvOffset) : createVector2(0, 0),
    uvRotation: opts?.uvRotation ?? 0,
    uvScale: opts?.uvScale ? cloneVector2(opts.uvScale) : createVector2(1, 1),
  });
}

// True once the texture references a pixel source. A texture with a null image is treated as an
// absent slot by materials, so this is the gate a material samples behind.
export function isTextureReady(texture: Readonly<TextureLike>): boolean {
  return texture.image !== null;
}

// Binds (or clears, with null) the texture's image source in place. Does not touch sampling state
// or the uv-transform.
export function setTextureImage(texture: TextureLike, image: ImageResource | null): void {
  texture.image = image;
}
