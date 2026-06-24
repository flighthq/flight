import type { FontMetrics, GlyphExtents, ShapedRun, TextShaperBackend } from '@flighthq/types';

import { setTextShaperBackend } from './textShaper';
import {
  clearShapedRun,
  createShapedRun,
  getCodePointForGlyph,
  getFontMetrics,
  getFontMetricsInto,
  getFontUnitScale,
  getGlyphExtents,
  getGlyphExtentsBatch,
  getGlyphExtentsInto,
  getGlyphIndexForCodePoint,
  getGlyphName,
  shapeTextRun,
  shapeTextRunInto,
} from './textShaperRun';

const _testGlyphs = [
  { cluster: 0, glyphId: 10, xAdvance: 8, xOffset: 0, yAdvance: 0, yOffset: 0 },
  { cluster: 1, glyphId: 20, xAdvance: 7, xOffset: 0, yAdvance: 0, yOffset: 0 },
];

const _testRun: ShapedRun = {
  advanceWidth: 15,
  direction: 'LeftToRight',
  font: null,
  glyphCount: 2,
  glyphs: _testGlyphs,
  script: 'Latn',
};

const _testMetrics: FontMetrics = {
  ascent: 10,
  capHeight: 8,
  descent: 3,
  lineGap: 1,
  underlinePosition: -2,
  underlineThickness: 1,
  unitsPerEm: 1000,
  xHeight: 5,
};

const _testExtents: GlyphExtents = { height: 10, width: 6, xBearing: 0, yBearing: -8 };

function _makeFullBackend(): TextShaperBackend {
  return {
    // Code point 65 ('A') maps to glyph 10 and back; everything else is unknown.
    getCodePointForGlyph: (id) => (id === 10 ? 65 : -1),
    getFontMetrics: () => ({ ..._testMetrics }),
    getGlyphExtents: (id) => (id === 10 ? { ..._testExtents } : null),
    getGlyphIndexForCodePoint: (cp) => (cp === 65 ? 10 : -1),
    getGlyphName: (id) => (id === 10 ? 'A' : ''),
    measureText: (text) => text.length * 8,
    shapeRun: () => ({ ..._testRun, glyphs: [..._testGlyphs] }),
  };
}

afterEach(() => {
  setTextShaperBackend(null);
});

describe('clearShapedRun', () => {
  it('resets all fields and empties the glyphs array', () => {
    const run = createShapedRun();
    (run as { advanceWidth: number }).advanceWidth = 42;
    (run.glyphs as unknown[]).push(_testGlyphs[0]);
    const returned = clearShapedRun(run);
    expect(run.advanceWidth).toBe(0);
    expect(run.glyphCount).toBe(0);
    expect(run.glyphs).toHaveLength(0);
    expect(run.direction).toBe('LeftToRight');
    expect(run.script).toBe('');
    expect(run.font).toBeNull();
    expect(returned).toBe(run);
  });

  it('retains the same glyphs array reference after clearing', () => {
    const run = createShapedRun();
    const arr = run.glyphs;
    clearShapedRun(run);
    expect(run.glyphs).toBe(arr);
  });
});

describe('createShapedRun', () => {
  it('returns an empty run with zero advance width', () => {
    const run = createShapedRun();
    expect(run.advanceWidth).toBe(0);
    expect(run.glyphCount).toBe(0);
    expect(run.glyphs).toHaveLength(0);
    expect(run.direction).toBe('LeftToRight');
    expect(run.font).toBeNull();
    expect(run.script).toBe('');
  });

  it('allocates a new run on each call', () => {
    expect(createShapedRun()).not.toBe(createShapedRun());
  });
});

describe('getCodePointForGlyph', () => {
  it('returns -1 when no backend is set', () => {
    expect(getCodePointForGlyph(10, {})).toBe(-1);
  });

  it('returns -1 when the backend does not implement getCodePointForGlyph', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    expect(getCodePointForGlyph(10, {})).toBe(-1);
  });

  it('delegates to the backend and returns the resolved code point', () => {
    setTextShaperBackend(_makeFullBackend());
    expect(getCodePointForGlyph(10, {})).toBe(65);
  });

  it('returns -1 for glyph ids the backend cannot reverse-map', () => {
    setTextShaperBackend(_makeFullBackend());
    expect(getCodePointForGlyph(999, {})).toBe(-1);
  });
});

describe('getFontMetrics', () => {
  it('returns null when no backend is set', () => {
    expect(getFontMetrics({})).toBeNull();
  });

  it('returns null when the backend is advances-only (no getFontMetrics)', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    expect(getFontMetrics({})).toBeNull();
  });

  it('delegates to the backend', () => {
    setTextShaperBackend(_makeFullBackend());
    const m = getFontMetrics({ size: 16 });
    expect(m).not.toBeNull();
    expect(m!.ascent).toBe(10);
    expect(m!.unitsPerEm).toBe(1000);
  });
});

describe('getFontMetricsInto', () => {
  it('returns false and does not modify out when no backend is set', () => {
    const out: FontMetrics = { ..._testMetrics, ascent: 99 };
    expect(getFontMetricsInto({}, out)).toBe(false);
    expect(out.ascent).toBe(99);
  });

  it('writes all fields into out and returns true on success', () => {
    setTextShaperBackend(_makeFullBackend());
    const out = { ..._testMetrics };
    expect(getFontMetricsInto({}, out)).toBe(true);
    expect(out.ascent).toBe(_testMetrics.ascent);
    expect(out.capHeight).toBe(_testMetrics.capHeight);
  });
});

describe('getFontUnitScale', () => {
  it('returns -1 when no backend is set', () => {
    expect(getFontUnitScale({})).toBe(-1);
  });

  it('returns size / unitsPerEm', () => {
    setTextShaperBackend(_makeFullBackend());
    // default size is 12 per the function; unitsPerEm is 1000.
    expect(getFontUnitScale({})).toBeCloseTo(12 / 1000);
    expect(getFontUnitScale({ size: 20 })).toBeCloseTo(20 / 1000);
  });
});

describe('getGlyphExtents', () => {
  it('returns null when no backend is set', () => {
    expect(getGlyphExtents(10, {})).toBeNull();
  });

  it('returns null when the backend is advances-only', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    expect(getGlyphExtents(10, {})).toBeNull();
  });

  it('delegates to the backend', () => {
    setTextShaperBackend(_makeFullBackend());
    const e = getGlyphExtents(10, {});
    expect(e).not.toBeNull();
    expect(e!.width).toBe(6);
  });

  it('returns null for unknown glyph ids', () => {
    setTextShaperBackend(_makeFullBackend());
    expect(getGlyphExtents(999, {})).toBeNull();
  });
});

describe('getGlyphExtentsBatch', () => {
  it('returns 0 and writes nothing when no backend is set', () => {
    const out: GlyphExtents[] = [];
    expect(getGlyphExtentsBatch([10, 20], {}, out)).toBe(0);
  });

  it('returns 0 when the backend is advances-only', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    const out: GlyphExtents[] = [];
    expect(getGlyphExtentsBatch([10], {}, out)).toBe(0);
  });

  it('resolves known glyphs and counts only those that resolved', () => {
    setTextShaperBackend(_makeFullBackend());
    const out: GlyphExtents[] = [];
    // 10 resolves; 999 is unknown.
    const resolved = getGlyphExtentsBatch([10, 999], {}, out);
    expect(resolved).toBe(1);
    expect(out).toHaveLength(2);
    expect(out[0].width).toBe(_testExtents.width);
  });

  it('writes zeroed extents for unknown glyphs so out is fully populated', () => {
    setTextShaperBackend(_makeFullBackend());
    const out: GlyphExtents[] = [];
    getGlyphExtentsBatch([999, 10], {}, out);
    expect(out[0]).toEqual({ height: 0, width: 0, xBearing: 0, yBearing: 0 });
    expect(out[1].height).toBe(_testExtents.height);
  });

  it('returns 0 for an empty glyph id list without touching the backend', () => {
    setTextShaperBackend(_makeFullBackend());
    const out: GlyphExtents[] = [];
    expect(getGlyphExtentsBatch([], {}, out)).toBe(0);
    expect(out).toHaveLength(0);
  });
});

describe('getGlyphExtentsInto', () => {
  it('returns false and does not modify out when no backend is set', () => {
    const out: GlyphExtents = { height: 1, width: 1, xBearing: 1, yBearing: 1 };
    expect(getGlyphExtentsInto(10, {}, out)).toBe(false);
    expect(out.width).toBe(1);
  });

  it('writes all fields into out and returns true on success', () => {
    setTextShaperBackend(_makeFullBackend());
    const out: GlyphExtents = { height: 0, width: 0, xBearing: 0, yBearing: 0 };
    expect(getGlyphExtentsInto(10, {}, out)).toBe(true);
    expect(out.width).toBe(_testExtents.width);
    expect(out.height).toBe(_testExtents.height);
    expect(out.yBearing).toBe(_testExtents.yBearing);
  });
});

describe('getGlyphIndexForCodePoint', () => {
  it('returns -1 when no backend is set', () => {
    expect(getGlyphIndexForCodePoint(65, {})).toBe(-1);
  });

  it('returns -1 when the backend does not implement getGlyphIndexForCodePoint', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    expect(getGlyphIndexForCodePoint(65, {})).toBe(-1);
  });

  it('delegates to the backend and returns the glyph id', () => {
    setTextShaperBackend(_makeFullBackend());
    expect(getGlyphIndexForCodePoint(65, {})).toBe(10);
  });

  it('returns -1 for code points with no glyph in the font', () => {
    setTextShaperBackend(_makeFullBackend());
    expect(getGlyphIndexForCodePoint(0x2603, {})).toBe(-1);
  });
});

describe('getGlyphName', () => {
  it('returns an empty string when no backend is set', () => {
    expect(getGlyphName(10, {})).toBe('');
  });

  it('returns an empty string when the backend does not implement getGlyphName', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    expect(getGlyphName(10, {})).toBe('');
  });

  it('delegates to the backend and returns the PostScript glyph name', () => {
    setTextShaperBackend(_makeFullBackend());
    expect(getGlyphName(10, {})).toBe('A');
  });

  it('returns an empty string for glyph ids the backend cannot name', () => {
    setTextShaperBackend(_makeFullBackend());
    expect(getGlyphName(999, {})).toBe('');
  });
});

describe('shapeTextRun', () => {
  it('returns null when no backend is set', () => {
    expect(shapeTextRun('hi', {})).toBeNull();
  });

  it('returns null when the backend is advances-only (no shapeRun)', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    expect(shapeTextRun('hi', {})).toBeNull();
  });

  it('delegates to backend.shapeRun', () => {
    setTextShaperBackend(_makeFullBackend());
    const run = shapeTextRun('ab', {});
    expect(run).not.toBeNull();
    expect(run!.glyphCount).toBe(2);
    expect(run!.direction).toBe('LeftToRight');
  });

  it('passes options to the backend', () => {
    let capturedOptions: unknown;
    setTextShaperBackend({
      measureText: () => 0,
      shapeRun: (_t, _f, opts) => {
        capturedOptions = opts;
        return { ..._testRun, glyphs: [] };
      },
    });
    shapeTextRun('x', {}, { direction: 'RightToLeft', script: 'Arab' });
    expect(capturedOptions).toMatchObject({ direction: 'RightToLeft', script: 'Arab' });
  });
});

describe('shapeTextRunInto', () => {
  it('returns false and does not modify out when no backend is set', () => {
    const out = createShapedRun();
    expect(shapeTextRunInto('hi', {}, out)).toBe(false);
    expect(out.glyphCount).toBe(0);
  });

  it('writes run fields and glyphs into out, returns true', () => {
    setTextShaperBackend(_makeFullBackend());
    const out = createShapedRun();
    expect(shapeTextRunInto('ab', {}, out)).toBe(true);
    expect(out.advanceWidth).toBe(15);
    expect(out.glyphCount).toBe(2);
    expect(out.glyphs).toHaveLength(2);
    expect(out.glyphs[0].glyphId).toBe(10);
    expect(out.script).toBe('Latn');
  });

  it('retains the existing glyphs array reference', () => {
    setTextShaperBackend(_makeFullBackend());
    const out = createShapedRun();
    const originalGlyphs = out.glyphs;
    shapeTextRunInto('ab', {}, out);
    expect(out.glyphs).toBe(originalGlyphs);
  });
});
