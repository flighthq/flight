export function detectFontFormat(bytes: ArrayBuffer | Uint8Array): string | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.byteLength < 4) return null;

  // sfnt version 0x00010000 → TrueType outlines
  if (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return 'truetype';

  // 'OTTO' → CFF/OpenType outlines
  if (b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f) return 'opentype';

  // 'wOFF' → WOFF
  if (b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x46) return 'woff';

  // 'wOF2' → WOFF2
  if (b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32) return 'woff2';

  // 'ttcf' → TrueType/OpenType Collection
  if (b[0] === 0x74 && b[1] === 0x74 && b[2] === 0x63 && b[3] === 0x66) return 'collection';

  // 'true' → legacy Apple TrueType
  if (b[0] === 0x74 && b[1] === 0x72 && b[2] === 0x75 && b[3] === 0x65) return 'truetype';

  return null;
}

export function inferFontFormatFromUrl(url: string): string | null {
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
