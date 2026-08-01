import { createFontResource } from './fontResource';
import {
  loadFontResourceFromBytes,
  loadFontResourceFromName,
  loadFontResourceFromUrl,
  loadFontResourceFromUrls,
} from './fontResourceFrom';

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

// Mirrors the harness in fontFrom.test.ts, including its restore discipline: the document.fonts
// descriptor is saved and put back per test rather than left overwritten, so under a shared
// (isolate:false) worker the patch cannot leak into a sibling file.
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadFontResourceFromBytes', () => {
  it('constructs the face under the resource family, loads it, and registers it', async () => {
    const resource = createFontResource('TestFont');
    const result = await loadFontResourceFromBytes(resource, new Uint8Array(8));
    expect(result).toBe(resource);
    expect(constructions).toHaveLength(1);
    expect(constructions[0].family).toBe('TestFont');
    expect(constructions[0].instance.load).toHaveBeenCalledOnce();
    expect(addMock).toHaveBeenCalledWith(constructions[0].instance);
    expect(resource.face).toBe(constructions[0].instance);
  });

  it('slices only the view bytes out of a larger backing buffer', async () => {
    // This integration assertion pins that the resource wrapper forwards its view to the canonical
    // byte loader rather than widening it back to the whole buffer.
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await loadFontResourceFromBytes(createFontResource('TestFont'), backing.subarray(2, 6));
    expect(new Uint8Array(constructions[0].source as ArrayBuffer)).toEqual(new Uint8Array([3, 4, 5, 6]));
  });

  it('propagates a load failure and does not register the face', async () => {
    const resource = createFontResource('TestFont');
    const failing = new MockFontFace('TestFont', new ArrayBuffer(0));
    failing.load.mockRejectedValue(new Error('bad font'));
    vi.stubGlobal(
      'FontFace',
      vi.fn(function () {
        return failing;
      }),
    );
    await expect(loadFontResourceFromBytes(resource, new Uint8Array(4))).rejects.toThrow('bad font');
    expect(addMock).not.toHaveBeenCalled();
    expect(resource.face).toBeNull();
  });

  it('leaves a previously loaded face attached when a reload fails', async () => {
    // The contract this pins: `face` is assigned only after the load resolves, so a failed reload
    // rejects and leaves the resource on the font it already had rather than blanking it. A caller
    // that ignores the rejection keeps rendering with a working font instead of losing one.
    const resource = createFontResource('TestFont');
    await loadFontResourceFromBytes(resource, new Uint8Array(4));
    const loaded = resource.face;
    expect(loaded).not.toBeNull();

    const failing = new MockFontFace('TestFont', new ArrayBuffer(0));
    failing.load.mockRejectedValue(new Error('boom'));
    vi.stubGlobal(
      'FontFace',
      vi.fn(function () {
        return failing;
      }),
    );
    await expect(loadFontResourceFromBytes(resource, new Uint8Array(4))).rejects.toThrow('boom');
    expect(resource.face).toBe(loaded);
    expect(addMock).toHaveBeenCalledTimes(1);
  });
});

describe('loadFontResourceFromName', () => {
  it('queries the family via the escaped font shorthand', async () => {
    await loadFontResourceFromName(createFontResource('MyFont'));
    expect(loadMock).toHaveBeenCalledWith("1em 'MyFont'");
  });

  it('escapes a single quote in the family name so the shorthand stays valid', async () => {
    await loadFontResourceFromName(createFontResource("Josh's Font"));
    expect(loadMock).toHaveBeenCalledWith("1em 'Josh\\'s Font'");
  });

  it('attaches the first face when the document returns several', async () => {
    const first = { family: 'first' } as unknown as FontFace;
    const second = { family: 'second' } as unknown as FontFace;
    loadMock.mockResolvedValue([first, second]);
    const resource = createFontResource('TestFont');
    const result = await loadFontResourceFromName(resource);
    expect(result).toBe(resource);
    expect(resource.face).toBe(first);
  });

  it('leaves face null when no registered faces are found', async () => {
    const resource = createFontResource('UnknownFont');
    await loadFontResourceFromName(resource);
    expect(resource.face).toBeNull();
  });

  it('registers nothing — a name lookup finds an existing face rather than adding one', async () => {
    loadMock.mockResolvedValue([{ family: 'x' } as unknown as FontFace]);
    await loadFontResourceFromName(createFontResource('TestFont'));
    expect(addMock).not.toHaveBeenCalled();
    expect(constructions).toHaveLength(0);
  });

  it('propagates a lookup failure', async () => {
    loadMock.mockRejectedValue(new Error('no such font'));
    await expect(loadFontResourceFromName(createFontResource('MyFont'))).rejects.toThrow('no such font');
  });
});

describe('loadFontResourceFromUrl', () => {
  it('builds a url() source under the resource family and registers the face', async () => {
    const resource = createFontResource('MyFont');
    const result = await loadFontResourceFromUrl(resource, 'https://example.com/font.woff2');
    expect(result).toBe(resource);
    expect(constructions[0].family).toBe('MyFont');
    expect(constructions[0].source).toBe('url(https://example.com/font.woff2)');
    expect(addMock).toHaveBeenCalledWith(constructions[0].instance);
    expect(resource.face).toBe(constructions[0].instance);
  });

  it('adds no format() hint — a single url carries none, unlike the multi-source form', async () => {
    await loadFontResourceFromUrl(createFontResource('MyFont'), 'font.woff2');
    expect(constructions[0].source).toBe('url(font.woff2)');
  });

  it('propagates a load failure and does not register the face', async () => {
    const resource = createFontResource('MyFont');
    const failing = new MockFontFace('MyFont', '');
    failing.load.mockRejectedValue(new Error('bad url'));
    vi.stubGlobal(
      'FontFace',
      vi.fn(function () {
        return failing;
      }),
    );
    await expect(loadFontResourceFromUrl(resource, 'font.woff2')).rejects.toThrow('bad url');
    expect(addMock).not.toHaveBeenCalled();
    expect(resource.face).toBeNull();
  });
});

describe('loadFontResourceFromUrls', () => {
  it('composes a comma-joined src with explicit and inferred format() hints', async () => {
    // The block this replaces was titled "builds a multi-source src string" and asserted nothing
    // about the string — only that a face was attached. The composed src is the whole point of this
    // function, and it was the one thing not checked.
    const resource = createFontResource('MyFont');
    const result = await loadFontResourceFromUrls(resource, [
      { url: 'font.woff2', format: 'woff2' },
      { url: 'font.ttf' },
    ]);
    expect(result).toBe(resource);
    expect(constructions[0].family).toBe('MyFont');
    expect(constructions[0].source).toBe("url(font.woff2) format('woff2'), url(font.ttf) format('truetype')");
    expect(addMock).toHaveBeenCalledWith(constructions[0].instance);
  });

  it('infers the format from the file extension when none is given', async () => {
    await loadFontResourceFromUrls(createFontResource('MyFont'), [{ url: 'font.otf' }]);
    expect(constructions[0].source).toBe("url(font.otf) format('opentype')");
  });

  it('omits the format() hint when it cannot be inferred and none is given', async () => {
    await loadFontResourceFromUrls(createFontResource('MyFont'), [{ url: 'font.bin' }]);
    expect(constructions[0].source).toBe('url(font.bin)');
  });

  it('mixes inferred, explicit, and absent hints across one src list', async () => {
    await loadFontResourceFromUrls(createFontResource('MyFont'), [
      { url: 'a.woff2', format: 'woff2' },
      { url: 'b.ttf' },
      { url: 'c.bin' },
    ]);
    expect(constructions[0].source).toBe("url(a.woff2) format('woff2'), url(b.ttf) format('truetype'), url(c.bin)");
  });

  it('builds an empty src for an empty source list rather than throwing', async () => {
    await loadFontResourceFromUrls(createFontResource('MyFont'), []);
    expect(constructions[0].source).toBe('');
  });

  it('propagates a load failure and does not register the face', async () => {
    const resource = createFontResource('MyFont');
    const failing = new MockFontFace('MyFont', '');
    failing.load.mockRejectedValue(new Error('bad url'));
    vi.stubGlobal(
      'FontFace',
      vi.fn(function () {
        return failing;
      }),
    );
    await expect(loadFontResourceFromUrls(resource, [{ url: 'font.woff2' }])).rejects.toThrow('bad url');
    expect(addMock).not.toHaveBeenCalled();
    expect(resource.face).toBeNull();
  });
});
