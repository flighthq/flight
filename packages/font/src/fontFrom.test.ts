import { loadFontFromBytes, loadFontFromName, loadFontFromUrl, loadFontFromUrls } from './fontFrom';

class MockFontFace {
  load = vi.fn().mockResolvedValue(undefined);
}

// Re-applied per test (not once) and torn down, so under a shared (isolate:false) worker with
// unstubGlobals the FontFace stub survives every test and the document.fonts patch never leaks out.
let originalFonts: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.stubGlobal('FontFace', MockFontFace);
  originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', {
    value: { add: vi.fn(), load: vi.fn().mockResolvedValue([]) },
    configurable: true,
  });
});

afterEach(() => {
  if (originalFonts) {
    Object.defineProperty(document, 'fonts', originalFonts);
  } else {
    delete (document as unknown as { fonts?: unknown }).fonts;
  }
});

describe('loadFontFromBytes', () => {
  it('returns a font with the given family name', async () => {
    const font = await loadFontFromBytes(new Uint8Array(0), 'TestFont');
    expect(font.name).toBe('TestFont');
  });
});

describe('loadFontFromName', () => {
  it('returns a font with the given name', async () => {
    const font = await loadFontFromName('MyFont');
    expect(font.name).toBe('MyFont');
  });
});

describe('loadFontFromUrl', () => {
  it('returns a font with the given family name', async () => {
    const font = await loadFontFromUrl('font.woff2', 'MyFont');
    expect(font.name).toBe('MyFont');
  });
});

describe('loadFontFromUrls', () => {
  it('returns a font with the given family name from multiple sources', async () => {
    const font = await loadFontFromUrls([{ url: 'font.woff2', format: 'woff2' }], 'MyFont');
    expect(font.name).toBe('MyFont');
  });
});
