import { loadFontFromArrayBuffer, loadFontFromName, loadFontFromURL, loadFontFromURLs } from './fontFrom';

class MockFontFace {
  load = vi.fn().mockResolvedValue(undefined);
}

beforeAll(() => {
  vi.stubGlobal('FontFace', MockFontFace);
  Object.defineProperty(document, 'fonts', {
    value: { add: vi.fn(), load: vi.fn().mockResolvedValue([]) },
    configurable: true,
  });
});

describe('loadFontFromArrayBuffer', () => {
  it('returns a font with the given family name', async () => {
    const font = await loadFontFromArrayBuffer(new ArrayBuffer(0), 'TestFont');
    expect(font.name).toBe('TestFont');
  });
});

describe('loadFontFromName', () => {
  it('returns a font with the given name', async () => {
    const font = await loadFontFromName('MyFont');
    expect(font.name).toBe('MyFont');
  });
});

describe('loadFontFromURL', () => {
  it('returns a font with the given family name', async () => {
    const font = await loadFontFromURL('font.woff2', 'MyFont');
    expect(font.name).toBe('MyFont');
  });
});

describe('loadFontFromURLs', () => {
  it('returns a font with the given family name from multiple sources', async () => {
    const font = await loadFontFromURLs([{ url: 'font.woff2', format: 'woff2' }], 'MyFont');
    expect(font.name).toBe('MyFont');
  });
});
