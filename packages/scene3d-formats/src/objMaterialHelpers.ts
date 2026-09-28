import type { Scene3DDocument, Texture, TextureColorSpace } from '@flighthq/types/contract';

import { createExternalTextureRef } from './shared.ts';

export function clampChannel(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 0xff);
}

export function externalObjTexture(
  uri: string | null,
  document: Scene3DDocument,
  colorSpace: TextureColorSpace,
): Texture | null {
  if (uri === null) return null;
  const texture = createExternalTextureRef(uri, null, document.resources);
  texture.colorSpace = colorSpace;
  return texture;
}

export function packObjColor(rgb: readonly [number, number, number], alpha: number): number {
  const r = clampChannel(rgb[0]);
  const g = clampChannel(rgb[1]);
  const b = clampChannel(rgb[2]);
  const a = clampChannel(alpha);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}
