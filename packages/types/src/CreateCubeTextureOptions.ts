import type { SamplerLike } from './Sampler.ts';
import type { TextureColorSpace, TextureSourceCubeFaces } from './Texture.ts';

export interface CreateCubeTextureOptions {
  colorSpace?: TextureColorSpace;
  sampler?: Readonly<SamplerLike>;
  sources?: TextureSourceCubeFaces;
}
