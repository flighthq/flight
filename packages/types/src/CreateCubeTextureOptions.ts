import type { SamplerLike } from './Sampler';
import type { TextureColorSpace } from './Texture';
import type { TextureCubeImages } from './TextureStorage';

export interface CreateCubeTextureOptions {
  colorSpace?: TextureColorSpace;
  images?: TextureCubeImages;
  sampler?: Readonly<SamplerLike>;
}
