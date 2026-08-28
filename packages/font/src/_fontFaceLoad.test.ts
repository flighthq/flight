import type { FontLoadingBackend } from '@flighthq/types/contract';

import {
  _loadFontFaceFromBytes,
  _loadFontFaceFromUrl,
  _loadFontFaceFromUrls,
  _loadFontFacesFromName,
} from './_fontFaceLoad';
import { resetFontLoadingBackendForTest, setFontLoadingBackend } from './fontLoading';

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
    constructions.push({ family, source, instance: this });
  }
}

beforeEach(() => {
  constructions = [];
  addMock = vi.fn();
  loadMock = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('FontFace', MockFontFace);
  const backend: FontLoadingBackend = {
    addFontFace: addMock,
    checkFontFace: vi.fn().mockReturnValue(false),
    loadFontFaces: loadMock,
    whenReady: vi.fn().mockResolvedValue(undefined),
  };
  setFontLoadingBackend(backend);
});

afterEach(() => {
  resetFontLoadingBackendForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('_loadFontFaceFromBytes', () => {
  it('loads and registers a face using only the bytes inside the supplied view', async () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const face = await _loadFontFaceFromBytes('Family', backing.subarray(1, 5));

    expect(face).toBe(constructions[0].instance);
    expect(new Uint8Array(constructions[0].source as ArrayBuffer)).toEqual(new Uint8Array([2, 3, 4, 5]));
    expect(constructions[0].instance.load).toHaveBeenCalledOnce();
    expect(addMock).toHaveBeenCalledWith(face);
  });
});

describe('_loadFontFaceFromUrl', () => {
  it('loads and registers the single URL source', async () => {
    await _loadFontFaceFromUrl('Family', 'font.woff2');
    expect(constructions[0].source).toBe('url(font.woff2)');
    expect(addMock).toHaveBeenCalledWith(constructions[0].instance);
  });
});

describe('_loadFontFaceFromUrls', () => {
  it('composes explicit, inferred, and absent format hints once for both public loader families', async () => {
    await _loadFontFaceFromUrls('Family', [{ url: 'a.woff2', format: 'woff2' }, { url: 'b.ttf' }, { url: 'c.bin' }]);

    expect(constructions[0].source).toBe("url(a.woff2) format('woff2'), url(b.ttf) format('truetype'), url(c.bin)");
  });

  it('does not register a face when loading rejects', async () => {
    const failing = new MockFontFace('Family', '');
    failing.load.mockRejectedValue(new Error('bad font'));
    vi.stubGlobal(
      'FontFace',
      vi.fn(function () {
        return failing;
      }),
    );

    await expect(_loadFontFaceFromUrls('Family', [{ url: 'font.woff2' }])).rejects.toThrow('bad font');
    expect(addMock).not.toHaveBeenCalled();
  });
});

describe('_loadFontFacesFromName', () => {
  it('uses the escaped shorthand and returns the document faces', async () => {
    const faces = [{ family: 'Family' } as unknown as FontFace];
    loadMock.mockResolvedValue(faces);

    await expect(_loadFontFacesFromName("Family's Name")).resolves.toBe(faces);
    expect(loadMock).toHaveBeenCalledWith("1em 'Family\\'s Name'");
  });
});
