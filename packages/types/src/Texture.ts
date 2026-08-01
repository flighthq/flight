import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Sampler } from './Sampler';
import type { TextureSource } from './TextureSource';
import type { TextureUvTransform } from './TextureUvTransform';
import type { VoxelGrid } from './VoxelGrid';

// How the texture's pixels are interpreted at sample time. baseColor/emissive maps are 'srgb'
// (decoded to linear on read); data maps — normal, metallic-roughness, occlusion — are
// 'linear' and must not be gamma-decoded. GPU realizers consume this field by choosing the matching
// sample format; shaders therefore receive linear values without per-material decode branches.
export type TextureColorSpace = 'linear' | 'srgb';

// Six source slots in canonical GPU cube-face order (+X, -X, +Y, -Y, +Z, -Z). Null remains a
// transitional incomplete-face sentinel until the named non-null loader stage.
export type TextureSourceCubeFaces = readonly [
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
];

// Common sampling-view fields. Texture's content variants stay flat because dimension is a closed
// GPU family and the source entity is the sharing/cache seam.
interface TextureCommon extends Entity, TextureUvTransform {
  colorSpace: TextureColorSpace;
  sampler: Sampler;
  // Integer dirty-bit for view changes. GPU handles remain render-state-owned and compare this
  // revision when deciding whether the texture needs resolving again.
  version: number;
}

export interface Texture2D extends TextureCommon {
  readonly dimension: '2d';
  source: TextureSource | null;
}

export type Texture =
  | Texture2D
  | (TextureCommon & {
      readonly dimension: '2d-array';
      sources: readonly (TextureSource | null)[];
    })
  | (TextureCommon & {
      readonly dimension: '3d';
      source: VoxelGrid | null;
    })
  | (TextureCommon & {
      readonly dimension: 'cube';
      sources: TextureSourceCubeFaces;
    });

type TextureLikeFrom<Type extends Texture> = Type extends Texture ? EntityWithoutRuntime<Type> : never;

export type TextureLike = TextureLikeFrom<Texture>;
