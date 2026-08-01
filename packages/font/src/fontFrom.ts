import type { Font, FontUrl } from '@flighthq/types/contract';

import {
  _loadFontFaceFromBytes,
  _loadFontFaceFromUrl,
  _loadFontFaceFromUrls,
  _loadFontFacesFromName,
} from './_fontFaceLoad';
import { createFont } from './font';

/**
 * Loads a font face from bytes and returns its family handle. If loading rejects, the face is not
 * registered and no `Font` is returned.
 */
export async function loadFontFromBytes(bytes: Uint8Array, family: string): Promise<Font> {
  await _loadFontFaceFromBytes(family, bytes);
  return createFont(family);
}

/** Looks up a registered family and returns its handle. If the lookup rejects, no `Font` is returned. */
export async function loadFontFromName(name: string): Promise<Font> {
  await _loadFontFacesFromName(name);
  return createFont(name);
}

/**
 * Loads a font face from one URL and returns its family handle. If loading rejects, the face is not
 * registered and no `Font` is returned.
 */
export async function loadFontFromUrl(url: string, family: string): Promise<Font> {
  await _loadFontFaceFromUrl(family, url);
  return createFont(family);
}

/**
 * Loads a font face from fallback URLs and returns its family handle. If loading rejects, the face is
 * not registered and no `Font` is returned.
 */
export async function loadFontFromUrls(sources: FontUrl[], family: string): Promise<Font> {
  await _loadFontFaceFromUrls(family, sources);
  return createFont(family);
}
