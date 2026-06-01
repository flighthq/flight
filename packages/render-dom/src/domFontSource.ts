import type { FontSource } from '@flighthq/types';

const _domFontAscentCache = new Map<string, number>();

export function getDomFontAscentCached(font: string): number | undefined {
  return _domFontAscentCache.get(font);
}

export function setDomFontAscentCached(font: string, ascent: number): void {
  _domFontAscentCache.set(font, ascent);
}

// Clear ascent cache entries for this font family so the next render re-probes
// with the newly loaded face rather than the fallback that was measured before.
export function connectFontSourceToDOMRenderer(source: FontSource): void {
  const family = source.family;
  for (const key of _domFontAscentCache.keys()) {
    if (key.includes(`'${family}'`) || key.includes(`"${family}"`)) {
      _domFontAscentCache.delete(key);
    }
  }
}
