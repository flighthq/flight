import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Sampler, SamplerLike } from './Sampler';
import type { TextureColorSpace } from './Texture';
import type { TextureUvTransform } from './TextureUvTransform';
import type { Vector2Like } from './Vector2';

// A backend-neutral render-to-texture source. Unlike Texture and VideoTexture it owns no CPU pixel
// source: a renderer keeps the backing target hidden on its render state and binds that target's
// resolved color attachment directly. The uv transform remains public because render-target storage
// follows the backend's framebuffer orientation rather than an uploaded image's orientation.
export interface RenderTexture extends Entity, TextureUvTransform {
  colorSpace: TextureColorSpace;
  readonly depth: boolean;
  height: number;
  sampler: Sampler;
  width: number;
}

export interface RenderTextureOptions {
  readonly colorSpace?: TextureColorSpace;
  readonly depth?: boolean;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly height: number;
  readonly sampler?: Readonly<SamplerLike>;
  readonly uvOffset?: Readonly<Vector2Like>;
  readonly uvRotation?: number;
  readonly uvScale?: Readonly<Vector2Like>;
  readonly width: number;
}

export type RenderTextureLike = EntityWithoutRuntime<RenderTexture>;
