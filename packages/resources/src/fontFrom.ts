import type { Font, FontUrl } from '@flighthq/types';

import { createFont } from './font';

function inferFontFormat(url: string): string | null {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'woff':
      return 'woff';
    case 'woff2':
      return 'woff2';
    case 'ttf':
      return 'truetype';
    case 'otf':
      return 'opentype';
    case 'eot':
      return 'embedded-opentype';
    case 'svg':
      return 'svg';
    default:
      return null;
  }
}

export async function loadFontFromArrayBuffer(buffer: ArrayBuffer, family: string): Promise<Font> {
  const face = new FontFace(family, buffer);
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

// Loads a font from multiple URL sources with format hints, letting the browser
// pick the best supported format without fetching the others.
export async function loadFontFromURLs(sources: FontUrl[], family: string): Promise<Font> {
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
