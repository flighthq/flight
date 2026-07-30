import type { FontResource, FontUrl } from '@flighthq/types/contract';

import { inferFontFormatFromUrl } from './fontFormat';
import { getFontShorthand } from './fontShorthand';

// These loaders fill a caller-owned FontResource. Each assigns `out.face` only after its load
// resolves, which is the contract on failure: a rejected load leaves the resource on whatever face it
// already had rather than blanking it, so a caller that swallows the rejection keeps rendering with a
// working font instead of losing one. Assigning before the await would silently turn a failed reload
// into a broken resource.

export async function loadFontResourceFromBytes(out: FontResource, bytes: Uint8Array): Promise<FontResource> {
  const face = new FontFace(
    out.family,
    (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  await face.load();
  document.fonts.add(face);
  out.face = face;
  return out;
}

export async function loadFontResourceFromName(out: FontResource): Promise<FontResource> {
  const faces = await document.fonts.load(getFontShorthand(out.family));
  if (faces.length > 0) out.face = faces[0];
  return out;
}

export async function loadFontResourceFromUrl(out: FontResource, url: string): Promise<FontResource> {
  const face = new FontFace(out.family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  out.face = face;
  return out;
}

export async function loadFontResourceFromUrls(out: FontResource, sources: FontUrl[]): Promise<FontResource> {
  const src = sources
    .map(({ url, format }) => {
      const fmt = format ?? inferFontFormatFromUrl(url);
      return fmt !== null ? `url(${url}) format('${fmt}')` : `url(${url})`;
    })
    .join(', ');
  const face = new FontFace(out.family, src);
  await face.load();
  document.fonts.add(face);
  out.face = face;
  return out;
}
