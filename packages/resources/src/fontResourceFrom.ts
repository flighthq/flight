import type { FontResource, FontUrl } from '@flighthq/types';

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

export async function loadFontResourceFromArrayBuffer(out: FontResource, buffer: ArrayBuffer): Promise<FontResource> {
  const face = new FontFace(out.family, buffer);
  await face.load();
  document.fonts.add(face);
  out.face = face;
  return out;
}

// Waits for a font already registered via CSS @font-face or document.fonts.add().
export async function loadFontResourceFromName(out: FontResource): Promise<FontResource> {
  const faces = await document.fonts.load(`1em '${out.family}'`);
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

// Loads from multiple URL sources with format hints; the browser picks the best format.
export async function loadFontResourceFromURLs(out: FontResource, sources: FontUrl[]): Promise<FontResource> {
  const src = sources
    .map(({ url, format }) => {
      const fmt = format ?? inferFontFormat(url);
      return fmt !== null ? `url(${url}) format('${fmt}')` : `url(${url})`;
    })
    .join(', ');
  const face = new FontFace(out.family, src);
  await face.load();
  document.fonts.add(face);
  out.face = face;
  return out;
}
