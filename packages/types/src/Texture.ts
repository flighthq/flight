import type { Entity, EntityWithoutRuntime } from './Entity';
import type { ImageResource } from './ImageResource';
import type { Sampler } from './Sampler';
import type { Vector2 } from './Vector2';

// How the texture's pixels are interpreted at sample time. baseColor/emissive maps are 'srgb'
// (decoded to linear on read); data maps — normal, metallic-roughness, occlusion — are
// 'linear' and must not be gamma-decoded. This is the single per-texture color-space flag the
// material seam relies on; without it every textured material is gamma-wrong.
export type TextureColorSpace = 'linear' | 'srgb';

// The universal image bridge for materials: an ImageResource pixel source plus the sampling
// state and color-space that govern how a material reads it. `image` is null for an unbound
// slot (the material treats it as absent). The uv-transform fields are the KHR_texture_transform
// model — `uvOffset`/`uvScale` shift and tile the coordinates and `uvRotation` (radians) spins
// them — applied before sampling. A graph that renders into a Texture writes its result through
// the same `image` resource, so any Mesh + Material can consume another graph's output.
export interface Texture extends Entity {
  colorSpace: TextureColorSpace;
  image: ImageResource | null;
  sampler: Sampler;
  uvOffset: Vector2;
  uvRotation: number;
  uvScale: Vector2;
}

export type TextureLike = EntityWithoutRuntime<Texture>;
