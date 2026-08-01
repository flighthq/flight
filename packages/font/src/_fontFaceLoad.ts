import type { FontUrl } from '@flighthq/types/contract';

import { inferFontFormatFromUrl } from './fontFormat';
import { getFontShorthand } from './fontShorthand';

export async function _loadFontFaceFromBytes(family: string, bytes: Uint8Array): Promise<FontFace> {
  const source = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loadAndRegisterFontFace(family, source);
}

export function _loadFontFaceFromUrl(family: string, url: string): Promise<FontFace> {
  return loadAndRegisterFontFace(family, `url(${url})`);
}

export function _loadFontFaceFromUrls(family: string, sources: readonly FontUrl[]): Promise<FontFace> {
  const source = sources
    .map(({ url, format }) => {
      const resolvedFormat = format ?? inferFontFormatFromUrl(url);
      return resolvedFormat !== null ? `url(${url}) format('${resolvedFormat}')` : `url(${url})`;
    })
    .join(', ');
  return loadAndRegisterFontFace(family, source);
}

export function _loadFontFacesFromName(family: string): Promise<FontFace[]> {
  return document.fonts.load(getFontShorthand(family));
}

async function loadAndRegisterFontFace(family: string, source: string | ArrayBuffer): Promise<FontFace> {
  const face = new FontFace(family, source);
  await face.load();
  document.fonts.add(face);
  return face;
}
