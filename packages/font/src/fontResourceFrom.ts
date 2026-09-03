import type { FontLoadingBackend, FontResource, FontUrl } from '@flighthq/types/contract';

import {
  _loadFontFaceFromBytes,
  _loadFontFaceFromUrl,
  _loadFontFaceFromUrls,
  _loadFontFacesFromName,
} from './_fontFaceLoad';

export async function loadFontResourceFromBytes(
  backend: Readonly<FontLoadingBackend>,
  out: FontResource,
  bytes: Uint8Array,
): Promise<FontResource> {
  const face = await _loadFontFaceFromBytes(backend, out.family, bytes);
  out.face = face;
  return out;
}

export async function loadFontResourceFromName(
  backend: Readonly<FontLoadingBackend>,
  out: FontResource,
): Promise<FontResource> {
  const faces = await _loadFontFacesFromName(backend, out.family);
  if (faces.length > 0) out.face = faces[0];
  return out;
}

export async function loadFontResourceFromUrl(
  backend: Readonly<FontLoadingBackend>,
  out: FontResource,
  url: string,
): Promise<FontResource> {
  const face = await _loadFontFaceFromUrl(backend, out.family, url);
  out.face = face;
  return out;
}

export async function loadFontResourceFromUrls(
  backend: Readonly<FontLoadingBackend>,
  out: FontResource,
  sources: FontUrl[],
): Promise<FontResource> {
  const face = await _loadFontFaceFromUrls(backend, out.family, sources);
  out.face = face;
  return out;
}
