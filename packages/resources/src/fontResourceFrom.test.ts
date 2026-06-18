import { createFontResource } from './fontResource';
import {
  loadFontResourceFromArrayBuffer,
  loadFontResourceFromName,
  loadFontResourceFromURL,
  loadFontResourceFromURLs,
} from './fontResourceFrom';

let mockFace: { load: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockFace = { load: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal(
    'FontFace',
    vi.fn(function () {
      return mockFace;
    }),
  );
  Object.defineProperty(document, 'fonts', {
    value: { add: vi.fn(), load: vi.fn() },
    configurable: true,
    writable: true,
  });
  vi.spyOn(document.fonts, 'add').mockImplementation(() => document.fonts);
  vi.spyOn(document.fonts, 'load').mockResolvedValue([mockFace as unknown as FontFace]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadFontResourceFromArrayBuffer', () => {
  it('loads the face and attaches it to the resource', async () => {
    const resource = createFontResource('TestFont');
    const result = await loadFontResourceFromArrayBuffer(resource, new ArrayBuffer(8));
    expect(result).toBe(resource);
    expect(resource.face).toBe(mockFace);
    expect(mockFace.load).toHaveBeenCalledOnce();
    expect(document.fonts.add).toHaveBeenCalledWith(mockFace);
  });
});

describe('loadFontResourceFromName', () => {
  it('resolves a face already registered with the document', async () => {
    const resource = createFontResource('TestFont');
    const result = await loadFontResourceFromName(resource);
    expect(result).toBe(resource);
    expect(resource.face).toBe(mockFace);
  });

  it('leaves face null when no registered faces are found', async () => {
    vi.spyOn(document.fonts, 'load').mockResolvedValue([]);
    const resource = createFontResource('UnknownFont');
    await loadFontResourceFromName(resource);
    expect(resource.face).toBeNull();
  });
});

describe('loadFontResourceFromURL', () => {
  it('loads the face from a URL and attaches it to the resource', async () => {
    const resource = createFontResource('TestFont');
    const result = await loadFontResourceFromURL(resource, 'https://example.com/font.woff2');
    expect(result).toBe(resource);
    expect(resource.face).toBe(mockFace);
    expect(document.fonts.add).toHaveBeenCalledWith(mockFace);
  });
});

describe('loadFontResourceFromURLs', () => {
  it('builds a multi-source src string and loads the face', async () => {
    const resource = createFontResource('TestFont');
    const result = await loadFontResourceFromURLs(resource, [
      { url: 'font.woff2', format: 'woff2' },
      { url: 'font.ttf' },
    ]);
    expect(result).toBe(resource);
    expect(resource.face).toBe(mockFace);
    expect(document.fonts.add).toHaveBeenCalledWith(mockFace);
  });

  it('infers format from file extension when no format is provided', async () => {
    const MockFontFace = vi.fn(function () {
      return mockFace;
    });
    vi.stubGlobal('FontFace', MockFontFace);
    const resource = createFontResource('TestFont');
    await loadFontResourceFromURLs(resource, [{ url: 'font.otf' }]);
    expect(MockFontFace).toHaveBeenCalledWith('TestFont', expect.stringContaining("format('opentype')"));
  });
});
