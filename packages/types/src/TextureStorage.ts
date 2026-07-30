import type { RenderTarget } from './RenderTarget';
import type { TextureSource } from './TextureSource';
import type { TextureVolume } from './TextureVolume';

// Two-dimensional texture storage composes the closed sampling dimension with an open backing.
// CPU-origin content uses `image`; GPU-origin rendered content uses `target` with no image. Backend
// resolver registries own realization and can distinguish these fields without a texture subtype.
export type TextureCubeImages = readonly [
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
];

export type TextureStorage =
  | {
      dimension: '2d';
      image: TextureSource | null;
      images?: never;
      target?: RenderTarget;
      volume?: never;
    }
  | {
      dimension: '2d-array';
      image?: never;
      images: readonly (TextureSource | null)[];
      target?: RenderTarget;
      volume?: never;
    }
  | {
      dimension: '3d';
      image?: never;
      images?: never;
      target?: RenderTarget;
      volume: TextureVolume | null;
    }
  | {
      dimension: 'cube';
      image?: never;
      images: TextureCubeImages;
      target?: RenderTarget;
      volume?: never;
    };
