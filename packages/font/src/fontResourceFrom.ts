import type { FontResource, FontUrl } from '@flighthq/types/contract';

import {
  _loadFontFaceFromBytes,
  _loadFontFaceFromUrl,
  _loadFontFaceFromUrls,
  _loadFontFacesFromName,
} from './_fontFaceLoad';

/**
 * Loads a face from bytes into `out`. If loading rejects, no face is registered and `out.face` retains
 * its previous value, so a failed reload does not blank a working resource.
 */
export async function loadFontResourceFromBytes(out: FontResource, bytes: Uint8Array): Promise<FontResource> {
  const face = await _loadFontFaceFromBytes(out.family, bytes);
  out.face = face;
  return out;
}

/**
 * Looks up an existing family and attaches its first face to `out`. If the lookup rejects or returns no
 * faces, `out.face` retains its previous value.
 */
export async function loadFontResourceFromName(out: FontResource): Promise<FontResource> {
  const faces = await _loadFontFacesFromName(out.family);
  if (faces.length > 0) out.face = faces[0];
  return out;
}

/**
 * Loads a face from one URL into `out`. If loading rejects, no face is registered and `out.face`
 * retains its previous value, so a failed reload does not blank a working resource.
 */
export async function loadFontResourceFromUrl(out: FontResource, url: string): Promise<FontResource> {
  const face = await _loadFontFaceFromUrl(out.family, url);
  out.face = face;
  return out;
}

/**
 * Loads a face from fallback URLs into `out`. If loading rejects, no face is registered and `out.face`
 * retains its previous value, so a failed reload does not blank a working resource.
 */
export async function loadFontResourceFromUrls(out: FontResource, sources: FontUrl[]): Promise<FontResource> {
  const face = await _loadFontFaceFromUrls(out.family, sources);
  out.face = face;
  return out;
}
