import type { FontSource } from '@flighthq/types';

import { createFontSource } from './fontSource';

export async function loadFontSourceFromName(name: string): Promise<FontSource> {
  await document.fonts.load(`1em '${name}'`);
  return createFontSource(name);
}

export async function loadFontSourceFromURL(url: string, family: string): Promise<FontSource> {
  const format = fontFormatFromURL(url);
  const src = format !== null ? `url(${url}) format('${format}')` : `url(${url})`;
  const face = new FontFace(family, src);
  await face.load();
  document.fonts.add(face);
  return createFontSource(family);
}

function fontFormatFromURL(url: string): string | null {
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
