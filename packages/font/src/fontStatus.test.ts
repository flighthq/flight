import { isFontLoaded, whenFontsReady } from './fontStatus';

let originalFonts: PropertyDescriptor | undefined;
let checkMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  checkMock = vi.fn().mockReturnValue(true);
  originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', {
    value: { check: checkMock, ready: Promise.resolve() },
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

describe('isFontLoaded', () => {
  it('queries document.fonts.check with the family shorthand', () => {
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
  it('resolves once document.fonts.ready resolves', async () => {
    await expect(whenFontsReady()).resolves.toBeUndefined();
  });
});
