import type { Entity, EntityWithoutRuntime } from './Entity';

// Texture-coordinate wrap behavior on one axis, mirroring the GL/Wgpu address modes.
export type TextureWrap = 'clamp-to-edge' | 'mirror-repeat' | 'repeat';

// Minification/magnification filtering, mirroring the GL/Wgpu filter modes. The mip-aware
// modes apply only when `mipmaps` is true on the Sampler.
export type TextureFilter =
  | 'linear'
  | 'linear-mipmap-linear'
  | 'linear-mipmap-nearest'
  | 'nearest'
  | 'nearest-mipmap-linear'
  | 'nearest-mipmap-nearest';

// Sampling state shared by a Texture: per-axis wrap, min/mag filters, anisotropy, and whether
// a mip chain is generated and sampled. Plain data; the backend translates it to a GL sampler
// / GPUSampler. `anisotropy` of 1 disables anisotropic filtering.
export interface Sampler extends Entity {
  anisotropy: number;
  magFilter: TextureFilter;
  minFilter: TextureFilter;
  mipmaps: boolean;
  wrapU: TextureWrap;
  wrapV: TextureWrap;
}

export type SamplerLike = EntityWithoutRuntime<Sampler>;
