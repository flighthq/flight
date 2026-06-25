import type { GlTextureFilterKind } from './GlTextureFilterKind';
import type { GlTextureWrapKind } from './GlTextureWrapKind';
export interface GlTextureDescriptor {
  readonly wrapS?: GlTextureWrapKind;
  readonly wrapT?: GlTextureWrapKind;
  readonly minFilter?: GlTextureFilterKind;
  readonly magFilter?: GlTextureFilterKind;
  readonly mipmaps?: boolean;
  readonly anisotropy?: number;
  readonly premultiplyAlpha?: boolean;
  readonly format?: GlTextureInternalFormat;
}
export type GlTextureInternalFormat =
  | 'r8'
  | 'r16f'
  | 'r32f'
  | 'rg8'
  | 'rg16f'
  | 'rgba8'
  | 'rgba16f'
  | 'rgba32f'
  | 'srgb8_alpha8';
