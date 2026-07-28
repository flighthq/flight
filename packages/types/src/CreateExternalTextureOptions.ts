import type { SamplerLike } from './Sampler';
import type { TextureColorSpace } from './Texture';

export interface CreateExternalTextureOptions {
  readonly colorSpace?: TextureColorSpace;
  readonly height: number;
  readonly sampler?: Readonly<SamplerLike>;
  readonly width: number;
}
