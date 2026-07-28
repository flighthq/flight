import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Sampler } from './Sampler';
import type { TextureStorage } from './TextureStorage';
import type { TextureUvTransform } from './TextureUvTransform';

// How the texture's pixels are interpreted at sample time. baseColor/emissive maps are 'srgb'
// (decoded to linear on read); data maps — normal, metallic-roughness, occlusion — are
// 'linear' and must not be gamma-decoded. This is the single per-texture color-space flag the
// material seam relies on; without it every textured material is gamma-wrong.
export type TextureColorSpace = 'linear' | 'srgb';

// The universal sampled-resource bridge for materials: context-neutral storage plus the sampling
// state and color-space that govern how a material reads it. `storage.image` is the CPU-origin
// backing; `storage.target` describes a GPU-origin produced backing. The uv-transform fields are the KHR_texture_transform
// model — `uvOffset`/`uvScale` shift and tile the coordinates and `uvRotation` (radians) spins
// them — applied before sampling. A graph that renders into a Texture writes its result through
// the same storage seam, so any Mesh + Material can consume another graph's output.
export interface Texture extends Entity, TextureUvTransform {
  colorSpace: TextureColorSpace;
  sampler: Sampler;
  storage: TextureStorage;
  // Integer dirty-bit for storage changes. GPU handles remain render-state-owned and compare this
  // revision when deciding whether the texture needs resolving again.
  version: number;
}

export type TextureLike = EntityWithoutRuntime<Texture>;
