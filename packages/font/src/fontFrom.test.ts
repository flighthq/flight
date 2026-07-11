import { loadFontFromBytes, loadFontFromName, loadFontFromUrl, loadFontFromUrls } from './fontFrom';

interface FontFaceConstruction {
  family: string;
  source: string | ArrayBuffer;
  instance: MockFontFace;
}

let constructions: FontFaceConstruction[];
let addMock: ReturnType<typeof vi.fn>;
let loadMock: ReturnType<typeof vi.fn>;

class MockFontFace {
  load = vi.fn().mockResolvedValue(undefined);
  constructor(family: string, source: string | ArrayBuffer) {
    const construction = { family, source, instance: this };
    constructions.push(construction);
  }
}

// Re-applied per test (not once) and torn down, so under a shared (isolate:false) worker with
// unstubGlobals the FontFace stub survives every test and the document.fonts patch never leaks out.
let originalFonts: PropertyDescriptor | undefined;
beforeEach(() => {
  constructions = [];
  addMock = vi.fn();
  loadMock = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('FontFace', MockFontFace);
  originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', {
    value: { add: addMock, load: loadMock },
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

  it('loads the face and registers it with document.fonts', async () => {
    await loadFontFromBytes(new Uint8Array(8), 'TestFont');
    expect(constructions).toHaveLength(1);
    expect(constructions[0].family).toBe('TestFont');
    expect(constructions[0].instance.load).toHaveBeenCalledOnce();
    expect(addMock).toHaveBeenCalledWith(constructions[0].instance);
  });

  it('slices only the view bytes out of a larger backing buffer', async () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const view = backing.subarray(2, 6);
    await loadFontFromBytes(view, 'TestFont');
    const source = constructions[0].source as ArrayBuffer;
    expect(new Uint8Array(source)).toEqual(new Uint8Array([3, 4, 5, 6]));
  });

  it('propagates a load failure and does not register the face', async () => {
    const failing = new MockFontFace('', new ArrayBuffer(0));
    failing.load.mockRejectedValue(new Error('bad font'));
    vi.stubGlobal(
      'FontFace',
      vi.fn(function () {
        return failing;
      }),
    );
    await expect(loadFontFromBytes(new Uint8Array(4), 'TestFont')).rejects.toThrow('bad font');
    expect(addMock).not.toHaveBeenCalled();
  });
});

describe('loadFontFromName', () => {
  it('returns a font with the given name', async () => {
    const font = await loadFontFromName('MyFont');
    expect(font.name).toBe('MyFont');
  });

  it('loads the family via the escaped font shorthand', async () => {
    await loadFontFromName('MyFont');
    expect(loadMock).toHaveBeenCalledWith("1em 'MyFont'");
  });

  it('escapes a single quote in the family name so the shorthand stays valid', async () => {
    await loadFontFromName("Josh's Font");
    expect(loadMock).toHaveBeenCalledWith("1em 'Josh\\'s Font'");
  });

  it('propagates a load failure', async () => {
    loadMock.mockRejectedValue(new Error('no such font'));
    await expect(loadFontFromName('MyFont')).rejects.toThrow('no such font');
  });
});

describe('loadFontFromUrl', () => {
  it('returns a font with the given family name', async () => {
    const font = await loadFontFromUrl('font.woff2', 'MyFont');
    expect(font.name).toBe('MyFont');
  });

  it('builds a url() source and registers the face', async () => {
    await loadFontFromUrl('font.woff2', 'MyFont');
    expect(constructions[0].family).toBe('MyFont');
    expect(constructions[0].source).toBe('url(font.woff2)');
    expect(addMock).toHaveBeenCalledWith(constructions[0].instance);
  });
});

describe('loadFontFromUrls', () => {
  it('returns a font with the given family name from multiple sources', async () => {
    const font = await loadFontFromUrls([{ url: 'font.woff2', format: 'woff2' }], 'MyFont');
    expect(font.name).toBe('MyFont');
  });

  it('composes a comma-joined src with explicit and inferred format() hints', async () => {
    await loadFontFromUrls([{ url: 'font.woff2', format: 'woff2' }, { url: 'font.ttf' }], 'MyFont');
    expect(constructions[0].source).toBe("url(font.woff2) format('woff2'), url(font.ttf) format('truetype')");
    expect(addMock).toHaveBeenCalledWith(constructions[0].instance);
  });

  it('omits the format() hint when it cannot be inferred and none is given', async () => {
    await loadFontFromUrls([{ url: 'font.bin' }], 'MyFont');
    expect(constructions[0].source).toBe('url(font.bin)');
  });

  it('propagates a load failure and does not register the face', async () => {
    const failing = new MockFontFace('', '');
    failing.load.mockRejectedValue(new Error('bad url'));
    vi.stubGlobal(
      'FontFace',
      vi.fn(function () {
        return failing;
      }),
    );
    await expect(loadFontFromUrls([{ url: 'font.woff2' }], 'MyFont')).rejects.toThrow('bad url');
    expect(addMock).not.toHaveBeenCalled();
  });
});
