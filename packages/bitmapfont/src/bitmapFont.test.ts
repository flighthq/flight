import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { BitmapFontData } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createBitmapFont,
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
  getBitmapFontPage,
  getBitmapFontPages,
  hasBitmapFontGlyph,
  initializeBitmapFont,
  packBitmapFontKerningKey,
  setBitmapFontGuard,
  unpackBitmapFontKerningKey,
} from './bitmapFont';

describe('createBitmapFont', () => {
  it('builds glyph and kerning lookups from plain data', () => {
    const font = createBitmapFont(sampleFontData());

    expect(font.glyphs.size).toBe(3);
    expect(font.kerning.size).toBe(1);
    expect(getBitmapFontGlyph(font, 65)).toEqual({
      advance: 9,
      bearingX: 1,
      bearingY: 8,
      height: 8,
      page: 0,
      width: 7,
      x: 0,
      y: 0,
    });
  });

  it('defaults encoding to raster and carries an explicit encoding', () => {
    expect(createBitmapFont(sampleFontData()).encoding).toBe('raster');
    expect(createBitmapFont({ ...sampleFontData(), encoding: 'msdf' }).encoding).toBe('msdf');
  });

  it('assigns each glyph its declared page and defaults an omitted page to 0', () => {
    const font = createBitmapFont({
      ...sampleFontData(),
      glyphs: [
        { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, page: 1, width: 7, x: 0, y: 0 },
        { advance: 10, bearingX: 1, bearingY: 8, codepoint: 66, height: 8, width: 7, x: 8, y: 0 },
      ],
      pages: [createTextureAtlas(), createTextureAtlas()],
    });

    expect(getBitmapFontGlyph(font, 65)!.page).toBe(1);
    expect(getBitmapFontGlyph(font, 66)!.page).toBe(0);
  });

  it('clamps an out-of-range glyph page to 0 rather than dropping the glyph', () => {
    const font = createBitmapFont({
      ...sampleFontData(),
      glyphs: [{ advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, page: 5, width: 7, x: 0, y: 0 }],
    });

    expect(getBitmapFontGlyph(font, 65)!.page).toBe(0);
  });
});

describe('getBitmapFontGlyph', () => {
  it('returns the entry for a present codepoint and null for an absent one', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontGlyph(font, 66)?.advance).toBe(10);
    expect(getBitmapFontGlyph(font, 0x1f600)).toBeNull();
  });

  it('returns a stable entry across repeated lookups (immutable)', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontGlyph(font, 65)).toBe(getBitmapFontGlyph(font, 65));
  });
});

describe('getBitmapFontKerning', () => {
  it('returns the pair amount and 0 for an absent pair', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontKerning(font, 65, 86)).toBe(-2);
    expect(getBitmapFontKerning(font, 86, 65)).toBe(0);
  });
});

describe('getBitmapFontKerning supplementary planes', () => {
  // The old key was `(left << 16) | right`, and JavaScript's bitwise operators truncate to 32 bits, so a
  // supplementary-plane codepoint did not overflow — it WRAPPED, landing on another pair's key. These
  // are the two aliases that produced, verified arithmetically against the old packing before the fix.
  const ALIASES = [
    { name: 'U+10000 aliased U+0000', supplementary: 0x10000, basic: 0x0000 },
    { name: 'U+1F600 aliased U+F600', supplementary: 0x1f600, basic: 0xf600 },
  ];

  for (const { name, supplementary, basic } of ALIASES) {
    it(`keeps a supplementary-plane pair distinct where ${name}`, () => {
      // Both pairs share a right glyph and differ only in the left, so a colliding key would make the
      // second write overwrite the first and BOTH lookups would return -9.
      const font = createBitmapFont({
        ...sampleFontData(),
        kerning: [
          { amount: -4, left: basic, right: 65 },
          { amount: -9, left: supplementary, right: 65 },
        ],
      });

      expect(font.kerning.size).toBe(2);
      expect(getBitmapFontKerning(font, basic, 65)).toBe(-4);
      expect(getBitmapFontKerning(font, supplementary, 65)).toBe(-9);
    });
  }

  it('keeps a supplementary-plane RIGHT glyph out of the left field', () => {
    // The right codepoint occupied the low 16 bits, so anything above U+FFFF carried into the left
    // glyph's field and reported another pair's adjustment.
    const font = createBitmapFont({
      ...sampleFontData(),
      kerning: [
        { amount: -3, left: 65, right: 0x10041 },
        { amount: -7, left: 66, right: 0x41 },
      ],
    });

    expect(getBitmapFontKerning(font, 65, 0x10041)).toBe(-3);
    expect(getBitmapFontKerning(font, 66, 0x41)).toBe(-7);
  });

  it('addresses the whole Unicode range up to its last codepoint', () => {
    const font = createBitmapFont({
      ...sampleFontData(),
      kerning: [{ amount: -5, left: 0x10ffff, right: 0x10ffff }],
    });

    // The largest key this packing produces; still an exact integer well inside the 2^53 range.
    expect(getBitmapFontKerning(font, 0x10ffff, 0x10ffff)).toBe(-5);
    expect(Number.isSafeInteger([...font.kerning.keys()][0])).toBe(true);
  });

  it('still returns 0 for a pair the font does not carry', () => {
    // Guards the guard: the tests above would pass just as well against a packing that returned a
    // distinct key for everything AND matched nothing.
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontKerning(font, 0x10000, 65)).toBe(0);
  });
});

describe('getBitmapFontMetrics', () => {
  it('returns the font line metrics', () => {
    const font = createBitmapFont(sampleFontData());

    expect(getBitmapFontMetrics(font)).toEqual({ ascent: 8, descent: 2, lineGap: 1 });
  });
});

describe('getBitmapFontPage', () => {
  it('returns the page atlas by index and null when out of range', () => {
    const page0 = createTextureAtlas();
    const page1 = createTextureAtlas();
    const font = createBitmapFont({ ...sampleFontData(), pages: [page0, page1] });

    expect(getBitmapFontPage(font)).toBe(page0);
    expect(getBitmapFontPage(font, 0)).toBe(page0);
    expect(getBitmapFontPage(font, 1)).toBe(page1);
    expect(getBitmapFontPage(font, 2)).toBeNull();
  });
});

function sampleFontData(): BitmapFontData {
  return {
    glyphs: [
      { advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, width: 7, x: 0, y: 0 },
      { advance: 10, bearingX: 1, bearingY: 8, codepoint: 66, height: 8, width: 7, x: 8, y: 0 },
      { advance: 8, bearingX: 1, bearingY: 8, codepoint: 86, height: 8, width: 6, x: 16, y: 0 },
    ],
    kerning: [{ amount: -2, left: 65, right: 86 }],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
    pages: [createTextureAtlas()],
  };
}

describe('getBitmapFontPages', () => {
  it('returns the page-indexed atlas list', () => {
    const page0 = createTextureAtlas();
    const page1 = createTextureAtlas();
    const font = createBitmapFont({ ...sampleFontData(), pages: [page0, page1] });

    expect(getBitmapFontPages(font)).toEqual([page0, page1]);
  });
});

describe('hasBitmapFontGlyph', () => {
  it('reports coverage without the caller naming the null sentinel', () => {
    const font = createBitmapFont(sampleFontData());

    expect(hasBitmapFontGlyph(font, 65)).toBe(true);
    expect(hasBitmapFontGlyph(font, 0x1f600)).toBe(false);
  });

  it('agrees with getBitmapFontGlyph on every codepoint it is asked about', () => {
    const font = createBitmapFont(sampleFontData());

    for (const codepoint of [65, 66, 86, 0, 67, 0x10000]) {
      expect(hasBitmapFontGlyph(font, codepoint)).toBe(getBitmapFontGlyph(font, codepoint) !== null);
    }
  });
});

describe('initializeBitmapFont', () => {
  it('is the construction initializer of createBitmapFont', () => {
    expect(typeof initializeBitmapFont).toBe('function');
  });
});

describe('packBitmapFontKerningKey', () => {
  it('gives every distinct pair a distinct key across the full codepoint space', () => {
    const pairs: readonly (readonly [number, number])[] = [
      [65, 86],
      [0, 65],
      [0x10000, 65],
      [0x1f600, 0xf600],
      [0xf600, 0x1f600],
      [0x10ffff, 0x10ffff],
    ];

    const keys = pairs.map(([left, right]) => packBitmapFontKerningKey(left, right));
    expect(new Set(keys).size).toBe(pairs.length);
  });

  it('stays inside exact-integer range at the largest pair', () => {
    // 0x10FFFF * 0x110000 + 0x10FFFF ≈ 1.24e12, well under 2^53 — the reason the key is arithmetic
    // rather than a 32-bit shift.
    const key = packBitmapFontKerningKey(0x10ffff, 0x10ffff);

    expect(Number.isSafeInteger(key)).toBe(true);
  });
});

describe('setBitmapFontGuard', () => {
  afterEach(() => {
    setBitmapFontGuard(null);
  });

  it('reports the repair with the codepoint and the index that was out of range', () => {
    // The seam, tested apart from the wording. enableBitmapFontGuards owns the message; this owns that
    // the core calls out at all and hands over enough to identify the glyph — remove the call and the
    // guard module has nothing to say however well written it is.
    const calls: [string, number, number][] = [];
    setBitmapFontGuard((reason, codepoint, page) => calls.push([reason, codepoint, page]));

    createBitmapFont({
      ...sampleFontData(),
      glyphs: [{ advance: 9, bearingX: 1, bearingY: 8, codepoint: 0x41, height: 8, page: 7, width: 7, x: 0, y: 0 }],
    });

    expect(calls).toEqual([['page-out-of-range', 0x41, 7]]);
  });

  it('stays quiet for a glyph whose page exists', () => {
    const calls: unknown[] = [];
    setBitmapFontGuard((...args) => calls.push(args));

    createBitmapFont(sampleFontData());

    expect(calls).toEqual([]);
  });

  it('uninstalls the guard when passed null', () => {
    const calls: unknown[] = [];
    setBitmapFontGuard((...args) => calls.push(args));
    setBitmapFontGuard(null);

    createBitmapFont({
      ...sampleFontData(),
      glyphs: [{ advance: 9, bearingX: 1, bearingY: 8, codepoint: 0x41, height: 8, page: 7, width: 7, x: 0, y: 0 }],
    });

    expect(calls).toEqual([]);
  });
});
describe('unpackBitmapFontKerningKey', () => {
  it('recovers the pair a key was packed from', () => {
    // The pairs are the ones a 16-bit inverse (`key >>> 16` / `key & 0xffff`) reads back wrong: an
    // ordinary BMP pair whose key is not shift-shaped, a supplementary-plane left glyph, and a pair
    // whose key leaves the 32-bit range the shift operators truncate to.
    const pairs: readonly (readonly [number, number])[] = [
      [65, 86],
      [0, 0],
      [0x41, 0x10ffff],
      [0x1f600, 0x41],
      [0x4e00, 0x4e8c],
      [0x10ffff, 0x10ffff],
    ];

    for (const [left, right] of pairs) {
      const key = packBitmapFontKerningKey(left, right);
      expect(unpackBitmapFontKerningKey(key, { left: 0, right: 0 })).toEqual({ left, right });
    }
  });

  it('recovers a pair whose key exceeds 2^32', () => {
    const key = packBitmapFontKerningKey(0x1f600, 0x41);
    expect(key).toBeGreaterThan(0x1_0000_0000);

    const pair = unpackBitmapFontKerningKey(key, { left: 0, right: 0 });

    expect(pair).toEqual({ left: 0x1f600, right: 0x41 });
    // What the truncating inverse this replaced would have produced from the same key.
    expect(pair.left).not.toBe(key >>> 16);
  });

  it('writes into the out object the caller supplied and returns it', () => {
    const out = { left: -1, right: -1 };

    const returned = unpackBitmapFontKerningKey(packBitmapFontKerningKey(0x10000, 0x41), out);

    expect(returned).toBe(out);
    expect(out).toEqual({ left: 0x10000, right: 0x41 });
  });

  it('reuses one out object across keys without carrying state between calls', () => {
    const out = { left: 0, right: 0 };

    unpackBitmapFontKerningKey(packBitmapFontKerningKey(0x10ffff, 0x10ffff), out);
    unpackBitmapFontKerningKey(packBitmapFontKerningKey(0, 0), out);

    expect(out).toEqual({ left: 0, right: 0 });
  });
});
