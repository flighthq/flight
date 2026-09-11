import type { HostFontLoadingProvider, FontUrl } from '@flighthq/types/contract';

import { inferFontFormatFromUrl } from './fontFormat';
import { getFontShorthand } from './fontShorthand';

export async function _loadFontFaceFromBytes(
  backend: Readonly<HostFontLoadingProvider>,
  family: string,
  bytes: Uint8Array,
): Promise<FontFace> {
  const source = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loadAndRegisterFontFace(backend, family, source);
}

export function _loadFontFaceFromUrl(
  backend: Readonly<HostFontLoadingProvider>,
  family: string,
  url: string,
): Promise<FontFace> {
  return loadAndRegisterFontFace(backend, family, `url(${url})`);
}

export function _loadFontFaceFromUrls(
  backend: Readonly<HostFontLoadingProvider>,
  family: string,
  sources: readonly FontUrl[],
): Promise<FontFace> {
  const source = sources
    .map(({ url, format }) => {
      const resolvedFormat = format ?? inferFontFormatFromUrl(url);
      return resolvedFormat !== null ? `url(${url}) format('${resolvedFormat}')` : `url(${url})`;
    })
    .join(', ');
  return loadAndRegisterFontFace(backend, family, source);
}

export function _loadFontFacesFromName(
  backend: Readonly<HostFontLoadingProvider>,
  family: string,
): Promise<FontFace[]> {
  return backend.loadFontFaces(getFontShorthand(family));
}

async function loadAndRegisterFontFace(
  backend: Readonly<HostFontLoadingProvider>,
  family: string,
  source: string | ArrayBuffer,
): Promise<FontFace> {
  const face = new FontFace(family, source);
  await face.load();
  backend.addFontFace(face);
  return face;
}
