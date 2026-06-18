import { getDomFontAscentCached, invalidateDOMFontResource, setDomFontAscentCached } from './domFontSource';

describe('getDomFontAscentCached', () => {
  it('returns undefined for an unknown font key', () => {
    expect(getDomFontAscentCached('12px "UnknownFont-x9z"')).toBeUndefined();
  });
});

describe('invalidateDOMFontResource', () => {
  it('removes cache entries that match the font family', () => {
    setDomFontAscentCached("16px 'MyFont'", 14);
    setDomFontAscentCached('16px "MyFont"', 14);
    invalidateDOMFontResource({ family: 'MyFont', face: null });
    expect(getDomFontAscentCached("16px 'MyFont'")).toBeUndefined();
    expect(getDomFontAscentCached('16px "MyFont"')).toBeUndefined();
  });

  it('does not remove cache entries for other families', () => {
    setDomFontAscentCached("16px 'OtherFont'", 13);
    invalidateDOMFontResource({ family: 'MyFont', face: null });
    expect(getDomFontAscentCached("16px 'OtherFont'")).toBe(13);
  });
});

describe('setDomFontAscentCached', () => {
  it('stores and retrieves an ascent value', () => {
    setDomFontAscentCached('12px "CacheTestFont"', 10);
    expect(getDomFontAscentCached('12px "CacheTestFont"')).toBe(10);
  });
});
