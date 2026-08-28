import type { FontLoadingBackend } from '@flighthq/types/contract';

import { resetFontLoadingBackendForTest, setFontLoadingBackend } from './fontLoading';
import { isFontLoaded, whenFontsReady } from './fontStatus';

let checkMock = vi.fn<(shorthand: string) => boolean>();
let whenReadyMock = vi.fn<() => Promise<void>>();

beforeEach(() => {
  checkMock = vi.fn<(shorthand: string) => boolean>().mockReturnValue(true);
  whenReadyMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const backend: FontLoadingBackend = {
    addFontFace: vi.fn<(face: FontFace) => void>(),
    checkFontFace: checkMock,
    loadFontFaces: vi.fn<(shorthand: string) => Promise<FontFace[]>>().mockResolvedValue([]),
    whenReady: whenReadyMock,
  };
  setFontLoadingBackend(backend);
});

afterEach(() => {
  resetFontLoadingBackendForTest();
});

describe('isFontLoaded', () => {
  it('queries the backend with the family shorthand', () => {
    expect(isFontLoaded('MyFont')).toBe(true);
    expect(checkMock).toHaveBeenCalledWith("1em 'MyFont'");
  });

  it('includes the style in the shorthand when provided', () => {
    isFontLoaded('MyFont', 'italic');
    expect(checkMock).toHaveBeenCalledWith("italic 1em 'MyFont'");
  });

  it('escapes single quotes in the family name', () => {
    isFontLoaded("Josh's Font");
    expect(checkMock).toHaveBeenCalledWith("1em 'Josh\\'s Font'");
  });

  it('returns false when the font is not available', () => {
    checkMock.mockReturnValue(false);
    expect(isFontLoaded('Absent')).toBe(false);
  });
});

describe('whenFontsReady', () => {
  it('resolves once the backend reports ready', async () => {
    await expect(whenFontsReady()).resolves.toBeUndefined();
    expect(whenReadyMock).toHaveBeenCalledOnce();
  });
});
