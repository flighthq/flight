export function inferFontFormat(url: string): string | null {
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
