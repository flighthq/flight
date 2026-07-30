import type { SamplerLike } from './Sampler';
import type { TextureColorSpace, TextureSourceCubeFaces } from './Texture';

export interface CreateCubeTextureOptions {
  colorSpace?: TextureColorSpace;
  sampler?: Readonly<SamplerLike>;
  sources?: TextureSourceCubeFaces;
}
