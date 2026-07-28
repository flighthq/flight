import type { ImageResource } from './ImageResource';
import type { TextureTargetBacking } from './TextureTargetBacking';
import type { TextureVolume } from './TextureVolume';

// Two-dimensional texture storage composes the closed sampling dimension with an open backing.
// CPU-origin content uses `image`; GPU-origin rendered content uses `target` with no image. Backend
// resolver registries own realization and can distinguish these fields without a texture subtype.
export type TextureCubeImages = readonly [
  ImageResource | null,
  ImageResource | null,
  ImageResource | null,
  ImageResource | null,
  ImageResource | null,
  ImageResource | null,
];

export type TextureStorage =
  | {
      dimension: '2d';
      image: ImageResource | null;
      images?: never;
      target?: TextureTargetBacking;
      volume?: never;
    }
  | {
      dimension: '2d-array';
      image?: never;
      images: readonly (ImageResource | null)[];
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
