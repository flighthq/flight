import { describe, expect, it } from 'vitest';

import { createTextFormatRange } from './textFormatRange';
import { layoutText } from './textLayout';

// Fixed-width measure: every character is 10px regardless of font settings.
const fixedMeasure = (text: string) => text.length * 10;

const fmt = { size: 16 };
const range = (start: number, end: number) => createTextFormatRange(fmt, start, end);

function singleRangeParams(text: string, width = 1000, overrides: object = {}) {
  return {
    text,
    formatRanges: [range(0, text.length)],
    width,
    height: 100,
    measure: fixedMeasure,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty / trivial
// ---------------------------------------------------------------------------

describe('layoutText — empty input', () => {
  it('returns an empty result for empty text', () => {
    const result = layoutText(singleRangeParams(''));
    expect(result.groups).toHaveLength(0);
    expect(result.numLines).toBe(1);
  });

  it('returns an empty result when formatRanges is empty', () => {
    const result = layoutText({ text: 'hello', formatRanges: [], width: 200, height: 100, measure: fixedMeasure });
    expect(result.groups).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Single-line, single format
// ---------------------------------------------------------------------------

describe('layoutText — single line', () => {
  it('produces one group for a simple string', () => {
    const result = layoutText(singleRangeParams('hello'));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].startIndex).toBe(0);
    expect(result.groups[0].endIndex).toBe(5);
    expect(result.groups[0].lineIndex).toBe(0);
  });

  it('positions the group at the gutter offset', () => {
    const result = layoutText(singleRangeParams('hi'));
    // baseX = GUTTER (2) + leftMargin (0) + blockIndent (0) + indent (0)
    expect(result.groups[0].offsetX).toBe(2);
    expect(result.groups[0].offsetY).toBe(2); // GUTTER
  });

  it('sets width to the sum of character advances', () => {
    const result = layoutText(singleRangeParams('abc'));
    // 3 chars × 10px = 30px — but pair-wise logic may produce slightly different
    // values. For a fixed-width font: measure("bc") - measure("c") = 20 - 10 = 10.
    expect(result.groups[0].width).toBeCloseTo(30, 0);
  });

  it('reports numLines as 1', () => {
    expect(layoutText(singleRangeParams('hello')).numLines).toBe(1);
  });

  it('stores per-character positions', () => {
    const result = layoutText(singleRangeParams('ab'));
    expect(result.groups[0].positions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Explicit line breaks
// ---------------------------------------------------------------------------

describe('layoutText — explicit line breaks (multiline)', () => {
  it('splits on \\n when multiline is true', () => {
    const text = 'ab\ncd';
    const result = layoutText(
      singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
    );
    const lines = result.groups.map((g) => g.lineIndex);
    expect(lines).toContain(0);
    expect(lines).toContain(1);
    expect(result.numLines).toBe(2);
  });

  it('does not split on \\n when multiline is false', () => {
    const text = 'ab\ncd';
    const result = layoutText(
      singleRangeParams(text, 1000, { multiline: false, formatRanges: [range(0, text.length)] }),
    );
    expect(result.numLines).toBe(1);
  });

  it('splits on \\r as well', () => {
    const text = 'ab\rcd';
    const result = layoutText(
      singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
    );
    expect(result.numLines).toBe(2);
  });

  it('handles multiple consecutive breaks', () => {
    const text = 'a\n\nb';
    const result = layoutText(
      singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
    );
    expect(result.numLines).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Word wrap
// ---------------------------------------------------------------------------

describe('layoutText — word wrap', () => {
  // With fixedMeasure (10px/char) and width=50:
  //   "hello world" → "hello " = 60px → wraps; "world" = 50px fits
  it('wraps at word boundary when line exceeds width', () => {
    const text = 'hello world';
    const result = layoutText(
      singleRangeParams(text, 50, { wordWrap: true, multiline: true, formatRanges: [range(0, text.length)] }),
    );
    // Should have groups on at least two lines
    const lineIndices = result.groups.map((g) => g.lineIndex);
    expect(Math.max(...lineIndices)).toBeGreaterThanOrEqual(1);
  });

  it('does not wrap when word wrap is false even if text exceeds width', () => {
    const text = 'hello world';
    const result = layoutText(singleRangeParams(text, 50, { wordWrap: false, formatRanges: [range(0, text.length)] }));
    expect(result.numLines).toBe(1);
  });

  it('breaks a single long word that exceeds the wrap width', () => {
    const text = 'abcdefghij'; // 100px, width=50 → should break mid-word
    const result = layoutText(
      singleRangeParams(text, 50, { wordWrap: true, multiline: true, formatRanges: [range(0, text.length)] }),
    );
    expect(result.numLines).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Multi-format ranges
// ---------------------------------------------------------------------------

describe('layoutText — multiple format ranges', () => {
  it('produces separate groups for each format range', () => {
    const text = 'helloworld';
    const result = layoutText({
      text,
      formatRanges: [createTextFormatRange({ size: 16 }, 0, 5), createTextFormatRange({ size: 24 }, 5, 10)],
      width: 1000,
      height: 100,
      measure: fixedMeasure,
    });
    // Expect at least 2 groups (one per range).
    expect(result.groups.length).toBeGreaterThanOrEqual(2);
    expect(result.groups[0].format.size).toBe(16);
    expect(result.groups[1].format.size).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

describe('layoutText — right alignment', () => {
  it('shifts group offsetX to right-align within container', () => {
    const text = 'hi'; // 20px wide, container=100
    const result = layoutText(
      singleRangeParams(text, 100, {
        formatRanges: [createTextFormatRange({ size: 16, align: 'right' }, 0, text.length)],
      }),
    );
    // With right align the group should be shifted right of the GUTTER start.
    expect(result.groups[0].offsetX).toBeGreaterThan(2);
  });
});

describe('layoutText — center alignment', () => {
  it('shifts group offsetX to center within container', () => {
    const text = 'hi'; // 20px, container=100
    const noAlignResult = layoutText(singleRangeParams(text, 100));
    const alignResult = layoutText(
      singleRangeParams(text, 100, {
        formatRanges: [createTextFormatRange({ size: 16, align: 'center' }, 0, text.length)],
      }),
    );
    expect(alignResult.groups[0].offsetX).toBeGreaterThan(noAlignResult.groups[0].offsetX);
  });
});

// ---------------------------------------------------------------------------
// Line metrics
// ---------------------------------------------------------------------------

describe('layoutText — line metrics', () => {
  it('reports lineWidths for each line', () => {
    const text = 'ab\ncd';
    const result = layoutText(
      singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
    );
    expect(result.lineWidths).toHaveLength(2);
  });

  it('reports lineHeights for each line', () => {
    const text = 'ab\ncd';
    const result = layoutText(
      singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
    );
    expect(result.lineHeights).toHaveLength(2);
    for (const h of result.lineHeights) expect(h).toBeGreaterThan(0);
  });

  it('reports textHeight > 0 for non-empty text', () => {
    const result = layoutText(singleRangeParams('hello'));
    expect(result.textHeight).toBeGreaterThan(0);
  });

  it('reports textWidth > 0 for non-empty text', () => {
    const result = layoutText(singleRangeParams('hello'));
    expect(result.textWidth).toBeGreaterThan(0);
  });
});
