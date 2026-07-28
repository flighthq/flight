import type { SamplerLike } from './Sampler';
import type { TextureColorSpace } from './Texture';
import type { Vector2Like } from './Vector2';

// Construction options for a produced 2D Texture. Target allocation stays lazy and backend-owned;
// sampling and UV fields remain ordinary Texture state.
export interface CreateRenderTextureOptions {
  readonly colorSpace?: TextureColorSpace;
  readonly colorAttachments?: number;
  readonly colorFormats?: ReadonlyArray<RenderTargetFormat>;
  readonly clearColors?: ReadonlyArray<number>;
  readonly clearDepth?: number;
  readonly depth?: RenderTargetDepth;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly format?: RenderTargetFormat;
  readonly height: number;
  readonly sampleCount?: number;
  readonly sampler?: Readonly<SamplerLike>;
  readonly uvOffset?: Readonly<Vector2Like>;
  readonly uvRotation?: number;
  readonly uvScale?: Readonly<Vector2Like>;
  readonly width: number;
}
import type { RenderTargetDepth, RenderTargetFormat } from './RenderTarget';
