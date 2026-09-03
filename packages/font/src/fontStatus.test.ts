import type { FontLoadingBackend } from '@flighthq/types/contract';

import { isFontLoaded, whenFontsReady } from './fontStatus';

function createMockBackend(overrides: Partial<FontLoadingBackend> = {}): FontLoadingBackend {
  return {
    addFontFace: vi.fn(),
    checkFontFace: vi.fn<(shorthand: string) => boolean>().mockReturnValue(true),
    loadFontFaces: vi.fn<(shorthand: string) => Promise<FontFace[]>>().mockResolvedValue([]),
    whenReady: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('isFontLoaded', () => {
  it('queries the backend with the family shorthand', () => {
    const checkMock = vi.fn<(shorthand: string) => boolean>().mockReturnValue(true);
    const backend = createMockBackend({ checkFontFace: checkMock });
    expect(isFontLoaded(backend, 'MyFont')).toBe(true);
    expect(checkMock).toHaveBeenCalledWith("1em 'MyFont'");
  });

  it('includes the style in the shorthand when provided', () => {
    const checkMock = vi.fn<(shorthand: string) => boolean>().mockReturnValue(true);
    const backend = createMockBackend({ checkFontFace: checkMock });
    isFontLoaded(backend, 'MyFont', 'italic');
    expect(checkMock).toHaveBeenCalledWith("italic 1em 'MyFont'");
  });

  it('escapes single quotes in the family name', () => {
    const checkMock = vi.fn<(shorthand: string) => boolean>().mockReturnValue(true);
    const backend = createMockBackend({ checkFontFace: checkMock });
    isFontLoaded(backend, "Josh's Font");
    expect(checkMock).toHaveBeenCalledWith("1em 'Josh\\'s Font'");
  });

  it('returns false when the font is not available', () => {
    const backend = createMockBackend({ checkFontFace: vi.fn().mockReturnValue(false) });
    expect(isFontLoaded(backend, 'Absent')).toBe(false);
  });
});

describe('whenFontsReady', () => {
  it('resolves once the backend reports ready', async () => {
    const whenReadyMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const backend = createMockBackend({ whenReady: whenReadyMock });
    await expect(whenFontsReady(backend)).resolves.toBeUndefined();
    expect(whenReadyMock).toHaveBeenCalledOnce();
  });
});
