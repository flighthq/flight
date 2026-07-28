import type { ImageBacking } from './ImageBacking';
import type { TextureTargetBacking } from './TextureTargetBacking';
import type { TextureVolume } from './TextureVolume';

// Two-dimensional texture storage composes the closed sampling dimension with an open backing.
// CPU-origin content uses `image`; GPU-origin rendered content uses `target` with no image. Backend
// resolver registries own realization and can distinguish these fields without a texture subtype.
export type TextureCubeImages = readonly [
  ImageBacking | null,
  ImageBacking | null,
  ImageBacking | null,
  ImageBacking | null,
  ImageBacking | null,
  ImageBacking | null,
];

export type TextureStorage =
  | {
      dimension: '2d';
      image: ImageBacking | null;
      images?: never;
      target?: TextureTargetBacking;
      volume?: never;
    }
  | {
      dimension: '2d-array';
      image?: never;
      images: readonly (ImageBacking | null)[];
      target?: TextureTargetBacking;
      volume?: never;
    }
  | {
      dimension: '3d';
      image?: never;
      images?: never;
      target?: TextureTargetBacking;
      volume: TextureVolume | null;
    }
  | {
      dimension: 'cube';
      image?: never;
      images: TextureCubeImages;
      target?: TextureTargetBacking;
      volume?: never;
    };
