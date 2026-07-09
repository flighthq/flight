import type { FontResource, FontUrl } from '@flighthq/types';

import { inferFontFormatFromUrl } from './fontFormat';
import { getFontShorthand } from './fontShorthand';

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
