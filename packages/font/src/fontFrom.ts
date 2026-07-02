import type { Font, FontUrl } from '@flighthq/types';

import { createFont } from './font';
import { inferFontFormat } from './fontFormat';

export async function loadFontFromBytes(bytes: Uint8Array, family: string): Promise<Font> {
  const face = new FontFace(
    family,
    (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  await face.load();
  document.fonts.add(face);
  return createFont(family);
}

export async function loadFontFromName(name: string): Promise<Font> {
  await document.fonts.load(`1em '${name}'`);
  return createFont(name);
}

export async function loadFontFromUrl(url: string, family: string): Promise<Font> {
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  return createFont(family);
}

export async function loadFontFromUrls(sources: FontUrl[], family: string): Promise<Font> {
  const src = sources
    .map(({ url, format }) => {
      const fmt = format ?? inferFontFormat(url);
      return fmt !== null ? `url(${url}) format('${fmt}')` : `url(${url})`;
    })
    .join(', ');
  const face = new FontFace(family, src);
  await face.load();
  document.fonts.add(face);
  return createFont(family);
}
