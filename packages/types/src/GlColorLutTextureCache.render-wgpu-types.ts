import type { ColorLut } from './ColorLut.ts';

export interface GlColorLutTextureCache {
  texture: WebGLTexture | null;
  lut: ColorLut | null;
}
