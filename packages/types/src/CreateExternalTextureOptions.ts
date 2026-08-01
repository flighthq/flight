import type { SamplerLike } from './Sampler';
import type { TextureColorSpace } from './Texture';

export interface CreateExternalTextureOptions {
  // Declares the borrowed handle's existing sample interpretation; the backend cannot reinterpret
  // or reallocate a caller-owned native texture.
  readonly colorSpace?: TextureColorSpace;
  readonly height: number;
  readonly sampler?: Readonly<SamplerLike>;
  readonly width: number;
}
