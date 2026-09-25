import type { HostFontLoadingCapability, FontResource, FontUrl } from '@flighthq/types/contract';

import {
  _loadFontFaceFromBytes,
  _loadFontFaceFromUrl,
  _loadFontFaceFromUrls,
  _loadFontFacesFromName,
} from './_fontFaceLoad.ts';

export async function loadFontResourceFromBytes(
  hostFontLoading: Readonly<HostFontLoadingCapability>,
  out: FontResource,
  bytes: Uint8Array,
): Promise<FontResource> {
  const face = await _loadFontFaceFromBytes(hostFontLoading, out.family, bytes);
  out.face = face;
  return out;
}

export async function loadFontResourceFromName(
  hostFontLoading: Readonly<HostFontLoadingCapability>,
  out: FontResource,
): Promise<FontResource> {
  const faces = await _loadFontFacesFromName(hostFontLoading, out.family);
  if (faces.length > 0) out.face = faces[0];
  return out;
}

export async function loadFontResourceFromUrl(
  hostFontLoading: Readonly<HostFontLoadingCapability>,
  out: FontResource,
  url: string,
): Promise<FontResource> {
  const face = await _loadFontFaceFromUrl(hostFontLoading, out.family, url);
  out.face = face;
  return out;
}

export async function loadFontResourceFromUrls(
  hostFontLoading: Readonly<HostFontLoadingCapability>,
  out: FontResource,
  sources: FontUrl[],
): Promise<FontResource> {
  const face = await _loadFontFaceFromUrls(hostFontLoading, out.family, sources);
  out.face = face;
  return out;
}
