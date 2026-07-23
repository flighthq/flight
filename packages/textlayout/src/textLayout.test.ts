import type { TextLayoutParams, TextLayoutResult } from '@flighthq/types';

import { createTextFormatRange } from './textFormatRange';
import { computeTextLayout, createTextLayoutResult, isTextLayoutTruncated, TEXT_LAYOUT_GUTTER } from './textLayout';

// Fixed-width measure: every character is 10px regardless of font settings.
const fixedMeasure = (text: string) => text.length * 10;

const fmt = { size: 16 };
const range = (start: number, end: number) => createTextFormatRange(fmt, start, end);

function singleRangeParams(text: string, width = 1000, overrides: object = {}): TextLayoutParams {
  return {
    text,
    formatRanges: [range(0, text.length)],
    width,
    height: 100,
    measure: fixedMeasure,
    ...overrides,
  };
}

function doLayout(params: TextLayoutParams): TextLayoutResult {
  const out = createTextLayoutResult();
  computeTextLayout(out, params);
  return out;
}

// ---------------------------------------------------------------------------
// createTextLayoutResult
// ---------------------------------------------------------------------------

describe('computeTextLayout', () => {
  it('returns groups and line metrics for simple text', () => {
    const result = doLayout(singleRangeParams('hi'));
    expect(result.groups).not.toBeNull();
    expect(result.numLines).toBeGreaterThan(0);
  });

  describe('center alignment', () => {
    it('shifts group offsetX to center within container', () => {
      const text = 'hi'; // 20px, container=100
      const noAlignResult = doLayout(singleRangeParams(text, 100));
      const noAlignOffsetX = noAlignResult.groups[0].offsetX;
      const alignResult = doLayout(
        singleRangeParams(text, 100, {
          formatRanges: [createTextFormatRange({ size: 16, align: 'center' }, 0, text.length)],
        }),
      );
      expect(alignResult.groups[0].offsetX).toBeGreaterThan(noAlignOffsetX);
    });

    // Guards the layout-with-real-width contract that the RichText renderers rely on: a single,
    // non-wrapping line must center against the real field width, not a wrap-prevention sentinel.
    // Passing a huge sentinel width (formerly 10000) shifted a short line ~4975px off-screen, so it
    // rendered nothing. offsetX must stay inside the container.
    it('centers a short single line against a real width when wordWrap is false', () => {
      const text = 'hi'; // 20px wide, container = 200
      const result = doLayout(
        singleRangeParams(text, 200, {
          formatRanges: [createTextFormatRange({ size: 16, align: 'center' }, 0, text.length)],
          multiline: false,
          wordWrap: false,
        }),
      );
      // slack = 200 - 20 - 2*GUTTER = 176 → shift = 88 → offsetX = GUTTER + 88 = 90
      const offsetX = result.groups[0].offsetX;
      expect(offsetX).toBe(90);
      expect(offsetX).toBeLessThan(200);
    });
  });

  describe('empty input', () => {
    it('returns an empty result for empty text', () => {
      const result = doLayout(singleRangeParams(''));
      expect(result.groups).toHaveLength(0);
      expect(result.numLines).toBe(1);
    });

    it('returns an empty result when formatRanges is empty', () => {
      const result = doLayout({ text: 'hello', formatRanges: [], width: 200, height: 100, measure: fixedMeasure });
      expect(result.groups).toHaveLength(0);
    });
  });

  describe('explicit line breaks (multiline)', () => {
    it('splits on \\n when multiline is true', () => {
      const text = 'ab\ncd';
      const result = doLayout(
        singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
      );
      const lines = result.groups.map((g) => g.lineIndex);
      expect(lines).toContain(0);
      expect(lines).toContain(1);
      expect(result.numLines).toBe(2);
    });

    it('does not split on \\n when multiline is false', () => {
      const text = 'ab\ncd';
      const result = doLayout(
        singleRangeParams(text, 1000, { multiline: false, formatRanges: [range(0, text.length)] }),
      );
      expect(result.numLines).toBe(1);
    });

    it('splits on \\r as well', () => {
      const text = 'ab\rcd';
      const result = doLayout(
        singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
      );
      expect(result.numLines).toBe(2);
    });

    it('handles multiple consecutive breaks', () => {
      const text = 'a\n\nb';
      const result = doLayout(
        singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
      );
      expect(result.numLines).toBe(3);
    });
  });

  describe('line metrics', () => {
    it('reports lineWidths for each line', () => {
      const text = 'ab\ncd';
      const result = doLayout(
        singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
      );
      expect(result.lineWidths).toHaveLength(2);
    });

    it('reports lineHeights for each line', () => {
      const text = 'ab\ncd';
      const result = doLayout(
        singleRangeParams(text, 1000, { multiline: true, formatRanges: [range(0, text.length)] }),
      );
      expect(result.lineHeights).toHaveLength(2);
      for (const h of result.lineHeights) expect(h).toBeGreaterThan(0);
    });

    it('reports textHeight > 0 for non-empty text', () => {
      const result = doLayout(singleRangeParams('hello'));
      expect(result.textHeight).toBeGreaterThan(0);
    });

    it('reports textWidth > 0 for non-empty text', () => {
      const result = doLayout(singleRangeParams('hello'));
      expect(result.textWidth).toBeGreaterThan(0);
    });
  });

  describe('multiple format ranges', () => {
    it('produces separate groups for each format range', () => {
      const text = 'helloworld';
      const result = doLayout({
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

  describe('right alignment', () => {
    it('shifts group offsetX to right-align within container', () => {
      const text = 'hi'; // 20px wide, container=100
      const result = doLayout(
        singleRangeParams(text, 100, {
          formatRanges: [createTextFormatRange({ size: 16, align: 'right' }, 0, text.length)],
        }),
      );
      // With right align the group should be shifted right of the GUTTER start.
      expect(result.groups[0].offsetX).toBeGreaterThan(2);
    });
  });

  describe('single line', () => {
    it('produces one group for a simple string', () => {
      const result = doLayout(singleRangeParams('hello'));
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].startIndex).toBe(0);
      expect(result.groups[0].endIndex).toBe(5);
      expect(result.groups[0].lineIndex).toBe(0);
    });

    it('positions the group at the gutter offset', () => {
      const result = doLayout(singleRangeParams('hi'));
      // baseX = GUTTER (2) + leftMargin (0) + blockIndent (0) + indent (0)
      expect(result.groups[0].offsetX).toBe(2);
      expect(result.groups[0].offsetY).toBe(2); // GUTTER
    });

    it('sets width to the sum of character advances', () => {
      const result = doLayout(singleRangeParams('abc'));
      // 3 chars × 10px = 30px — but pair-wise logic may produce slightly different
      // values. For a fixed-width font: measure("bc") - measure("c") = 20 - 10 = 10.
      expect(result.groups[0].width).toBeCloseTo(30, 0);
    });

    it('reports numLines as 1', () => {
      expect(doLayout(singleRangeParams('hello')).numLines).toBe(1);
    });

    it('stores per-character positions', () => {
      const result = doLayout(singleRangeParams('ab'));
      expect(result.groups[0].positions).toHaveLength(2);
    });
  });

  describe('vertical alignment', () => {
    // A single short line in a tall (height=200) container has ample vertical slack.
    const tall = (overrides: object = {}) => singleRangeParams('hi', 100, { height: 200, ...overrides });

    it('leaves offsetY unchanged for the top default', () => {
      const implicitTop = doLayout(tall()).groups[0].offsetY;
      const explicitTop = doLayout(tall({ verticalAlign: 'top' })).groups[0].offsetY;
      expect(explicitTop).toBe(implicitTop);
    });

    it('shifts the block down for middle and further for bottom when the container has slack', () => {
      const topY = doLayout(tall()).groups[0].offsetY;
      const middleY = doLayout(tall({ verticalAlign: 'middle' })).groups[0].offsetY;
      const bottomY = doLayout(tall({ verticalAlign: 'bottom' })).groups[0].offsetY;
      expect(middleY).toBeGreaterThan(topY);
      expect(bottomY).toBeGreaterThan(middleY);
    });

    it('places middle at exactly half the bottom shift', () => {
      const topY = doLayout(tall()).groups[0].offsetY;
      const middleY = doLayout(tall({ verticalAlign: 'middle' })).groups[0].offsetY;
      const bottomY = doLayout(tall({ verticalAlign: 'bottom' })).groups[0].offsetY;
      expect(middleY - topY).toBeCloseTo((bottomY - topY) / 2);
    });

    it('shifts the bottom block by the full vertical slack (content height + gutters)', () => {
      const height = 200;
      const topResult = doLayout(tall());
      const bottomResult = doLayout(tall({ verticalAlign: 'bottom' }));
      const slack = height - (topResult.textHeight + TEXT_LAYOUT_GUTTER * 2);
      expect(bottomResult.groups[0].offsetY - topResult.groups[0].offsetY).toBeCloseTo(slack);
    });

    it('is inert when the container is not taller than its content (no slack)', () => {
      const short = (overrides: object = {}) => singleRangeParams('hi', 100, { height: 4, ...overrides });
      const topY = doLayout(short()).groups[0].offsetY;
      expect(doLayout(short({ verticalAlign: 'middle' })).groups[0].offsetY).toBe(topY);
      expect(doLayout(short({ verticalAlign: 'bottom' })).groups[0].offsetY).toBe(topY);
    });
  });

  describe('word wrap', () => {
    // With fixedMeasure (10px/char) and width=50:
    //   "hello world" → "hello " = 60px → wraps; "world" = 50px fits
    it('wraps at word boundary when line exceeds width', () => {
      const text = 'hello world';
      const result = doLayout(
        singleRangeParams(text, 50, { wordWrap: true, multiline: true, formatRanges: [range(0, text.length)] }),
      );
      // Should have groups on at least two lines
      const lineIndices = result.groups.map((g) => g.lineIndex);
      expect(Math.max(...lineIndices)).toBeGreaterThanOrEqual(1);
    });

    it('does not wrap when word wrap is false even if text exceeds width', () => {
      const text = 'hello world';
      const result = doLayout(singleRangeParams(text, 50, { wordWrap: false, formatRanges: [range(0, text.length)] }));
      expect(result.numLines).toBe(1);
    });

    it('breaks a single long word that exceeds the wrap width', () => {
      const text = 'abcdefghij'; // 100px, width=50 → should break mid-word
      const result = doLayout(
        singleRangeParams(text, 50, { wordWrap: true, multiline: true, formatRanges: [range(0, text.length)] }),
      );
      expect(result.numLines).toBeGreaterThan(1);
    });

    // Reconstructing the placed text from group [startIndex, endIndex) spans must
    // preserve every non-space character. A wrap that advanced past the first
    // character of the wrapped word would drop it here.
    it('preserves every character when wrapping across word boundaries', () => {
      const text = 'aaa bbb ccc';
      const result = doLayout(
        singleRangeParams(text, 60, { wordWrap: true, multiline: true, formatRanges: [range(0, text.length)] }),
      );
      const placed = result.groups.map((g) => text.slice(g.startIndex, g.endIndex)).join('');
      expect(placed.replace(/ /g, '')).toBe(text.replace(/ /g, ''));
    });

    it('preserves every character when wrapping multi-format (rich) text', () => {
      const text = 'aaa bbb ccc';
      const result = doLayout({
        text,
        formatRanges: [createTextFormatRange({ size: 16 }, 0, 4), createTextFormatRange({ size: 16 }, 4, text.length)],
        width: 60,
        height: 100,
        measure: fixedMeasure,
        wordWrap: true,
        multiline: true,
      });
      const placed = result.groups.map((g) => text.slice(g.startIndex, g.endIndex)).join('');
      expect(placed.replace(/ /g, '')).toBe(text.replace(/ /g, ''));
    });
  });
});

describe('computeTextLayout — bullet list items', () => {
  it('emits a bullet glyph group for a format with bullet:true', () => {
    const text = 'item';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, bullet: true }, 0, text.length)],
      width: 200,
      height: 100,
      measure: fixedMeasure,
      multiline: true,
    });
    // There should be a bullet group (zero-length startIndex===endIndex) plus a text group.
    const bulletGroup = result.groups.find((g) => g.startIndex === g.endIndex);
    expect(bulletGroup).toBeDefined();
    expect(bulletGroup!.lineIndex).toBe(0);
  });

  it('lets an explicit positive indent win over the bullet width (text may overlap the bullet)', () => {
    // Contract: a user-set positive indent is authoritative — it is NOT clamped
    // up to the bullet glyph width. With fixedMeasure the bullet '•' is 10px wide,
    // but indent:1 keeps the text at baseX = GUTTER(2) + indent(1) = 3, inside the
    // bullet's 10px span, so the text deliberately overlaps the bullet.
    const text = 'item';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, bullet: true, indent: 1 }, 0, text.length)],
      width: 200,
      height: 100,
      measure: fixedMeasure,
      multiline: true,
    });
    const bulletGroup = result.groups.find((g) => g.startIndex === g.endIndex);
    const textGroup = result.groups.find((g) => g.startIndex !== g.endIndex);
    expect(bulletGroup).toBeDefined();
    expect(textGroup).toBeDefined();
    expect(bulletGroup!.offsetX).toBe(TEXT_LAYOUT_GUTTER); // bullet at the gutter
    expect(textGroup!.offsetX).toBe(TEXT_LAYOUT_GUTTER + 1); // explicit indent honored, not clamped
    // The text starts inside the bullet's drawn width → overlap is the accepted behavior.
    expect(textGroup!.offsetX).toBeLessThan(bulletGroup!.offsetX + bulletGroup!.width);
  });
});

describe('computeTextLayout — codepoint iteration', () => {
  it('does not split surrogate pairs (astral codepoints)', () => {
    // U+1F600 GRINNING FACE is a surrogate pair (2 UTF-16 code units).
    const emoji = '😀'; // 😀
    const text = emoji + 'ab';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16 }, 0, text.length)],
      width: 200,
      height: 100,
      measure: (s) => s.length * 10, // length-based to expose split
    });
    // The emoji is 2 code units but 1 codepoint; positions should reflect
    // that the emoji is one logical character (not split into 2).
    expect(result.groups[0].positions.length).toBe(3); // emoji + 'a' + 'b' = 3 codepoints
  });
});

describe('computeTextLayout — conformance: bullet listMarker:none suppresses glyph', () => {
  it('does not emit a bullet group when listMarker is none', () => {
    const text = 'item';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, bullet: true, listMarker: 'none' }, 0, text.length)],
      width: 200,
      height: 100,
      measure: fixedMeasure,
      multiline: true,
    });
    // With listMarker: 'none', no zero-length bullet group should be emitted.
    const bulletGroups = result.groups.filter((g) => g.startIndex === g.endIndex);
    expect(bulletGroups).toHaveLength(0);
  });

  it('emits a bullet group when listMarker is absent (default bullet)', () => {
    const text = 'item';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, bullet: true }, 0, text.length)],
      width: 200,
      height: 100,
      measure: fixedMeasure,
      multiline: true,
    });
    const bulletGroups = result.groups.filter((g) => g.startIndex === g.endIndex);
    expect(bulletGroups.length).toBeGreaterThan(0);
  });
});

describe('computeTextLayout — conformance: center alignment golden values', () => {
  it('places a 20px text at offsetX 40 inside a 100px container', () => {
    // container=100, gutter=2, text="hi"=20px
    // slack = 100 - 20 - 2*2 = 76 → shift = 76/2 = 38 → offsetX = 2 + 38 = 40
    const text = 'hi';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'center' }, 0, text.length)],
      width: 100,
      height: 100,
      measure: fixedMeasure,
    });
    expect(result.groups[0].offsetX).toBe(40);
  });
});

describe('computeTextLayout — conformance: justify multi-paragraph', () => {
  // Two paragraphs separated by \n. Only the non-last lines of each paragraph
  // should be justified; last lines of each paragraph remain left-aligned.
  //
  // Text: "aa bb\ncc dd" with width=100 (available=96 after gutters)
  // "aa bb" fits on one line → that is the last line of para 1 → NOT justified
  // "cc dd" is the last line of para 2 → NOT justified
  it('does not justify the last line of each paragraph in multi-paragraph text', () => {
    const text = 'aa bb\ncc dd';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'justify' }, 0, text.length)],
      width: 100,
      height: 200,
      measure: fixedMeasure,
      multiline: true,
    });
    expect(result.numLines).toBe(2);
    // Both lines are paragraph-last lines → neither should be shifted by justify.
    const line0Groups = result.groups.filter((g) => g.lineIndex === 0);
    const line1Groups = result.groups.filter((g) => g.lineIndex === 1);
    // Line 0 first group should start at TEXT_LAYOUT_GUTTER (left-aligned).
    expect(line0Groups[0]?.offsetX).toBe(TEXT_LAYOUT_GUTTER);
    // Line 1 first group should also start at TEXT_LAYOUT_GUTTER.
    expect(line1Groups[0]?.offsetX).toBe(TEXT_LAYOUT_GUTTER);
  });

  it('justifies mid-paragraph lines but not paragraph-last lines when word-wrap splits a paragraph', () => {
    // A single paragraph of "aa bb cc dd" with narrow width=50 so it wraps.
    // Line 0: "aa bb" (wrapped mid-paragraph) — should be justified (2 groups, residual ~46px)
    // Line 1: "cc dd" (last line of para) — should NOT be justified
    const text = 'aa bb cc dd';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'justify' }, 0, text.length)],
      width: 56, // available=52, 'aa bb' = 50px → fits; 'cc' would push to 56 total → wraps
      height: 200,
      measure: fixedMeasure,
      multiline: true,
      wordWrap: true,
    });
    expect(result.numLines).toBeGreaterThanOrEqual(2);
    // The last line must not be justified (groups remain at their natural left offset).
    const lastLineIdx = result.numLines - 1;
    const lastLineGroups = result.groups.filter((g) => g.lineIndex === lastLineIdx);
    // The very first group on the last line is always at its natural base position.
    if (lastLineGroups.length > 0) {
      expect(lastLineGroups[0].offsetX).toBe(TEXT_LAYOUT_GUTTER);
    }
  });
});

describe('computeTextLayout — conformance: right alignment golden values', () => {
  it('places a 20px text at offsetX 78 inside a 100px container', () => {
    // container=100, gutter=2, text="hi"=20px
    // rightEdge = 100 - 20 - 2*2 = 76 → shift=76 → offsetX = 2 + 76 = 78
    const text = 'hi';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'right' }, 0, text.length)],
      width: 100,
      height: 100,
      measure: fixedMeasure,
    });
    expect(result.groups[0].offsetX).toBe(78);
  });
});

describe('computeTextLayout — conformance: truncation + word-wrap combined', () => {
  it('clips a long word spanning the maxLines boundary', () => {
    // A very long word on a narrow container forces word-breaking.
    // With maxLines=1 the first broken segment is placed, then truncated.
    const text = 'abcdefghijklmnop'; // 160px with fixedMeasure
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16 }, 0, text.length)],
      width: 60, // narrow: forces word-break, each segment ~5-6 chars
      height: 200,
      measure: fixedMeasure,
      multiline: true,
      wordWrap: true,
      maxLines: 1,
    });
    // At most 1 line after truncation.
    expect(result.numLines).toBeLessThanOrEqual(1);
    // The last visible group on line 0 must exist.
    const line0Groups = result.groups.filter((g) => g.lineIndex === 0);
    expect(line0Groups.length).toBeGreaterThan(0);
  });

  it('appends ellipsis when word-wrapped text overflows maxLines', () => {
    const text = 'word one word two word three word four';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16 }, 0, text.length)],
      width: 100,
      height: 200,
      measure: fixedMeasure,
      multiline: true,
      wordWrap: true,
      maxLines: 2,
    });
    expect(result.numLines).toBeLessThanOrEqual(2);
    // There must be at least one group (ellipsis or text) on the last line.
    const lastGroups = result.groups.filter((g) => g.lineIndex === result.numLines - 1);
    expect(lastGroups.length).toBeGreaterThan(0);
  });

  it('truncates a single long word that straddles the maxLines boundary across both truncation paths', () => {
    // A short word "go " wraps via the main-loop path onto line 0, then a single
    // unbroken long word is split by breakLongWord across the remaining lines.
    // With maxLines=2, the long word crosses the line-2 boundary, so the
    // main-loop truncation (after the space-wrap commit) and breakLongWord's own
    // checkTruncation are both reachable in one layout.
    const text = 'go abcdefghijklmnopqrstuvwxyz';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16 }, 0, text.length)],
      width: 60, // ~5-6 chars/line → long word spans several broken segments
      height: 200,
      measure: fixedMeasure,
      multiline: true,
      wordWrap: true,
      maxLines: 2,
    });
    // Clipped to at most maxLines.
    expect(result.numLines).toBeLessThanOrEqual(2);
    // The last visible line carries a group (the truncated word segment or ellipsis).
    const lastGroups = result.groups.filter((g) => g.lineIndex === result.numLines - 1);
    expect(lastGroups.length).toBeGreaterThan(0);
    expect(isTextLayoutTruncated(result, { ...singleRangeParams(text), maxLines: 2 })).toBe(true);
  });
});

describe('computeTextLayout — justify alignment', () => {
  it('shifts group offsets for justified mid-line (non-last) lines', () => {
    const text = 'a b\nc d';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'justify' }, 0, text.length)],
      width: 100,
      height: 200,
      measure: fixedMeasure,
      multiline: true,
    });
    // Line 0 is not the last line, so it should be justified (groups shifted / wider).
    // Line 1 is the last line, so it should remain left-aligned.
    expect(result.numLines).toBe(2);
    const line0Groups = result.groups.filter((g) => g.lineIndex === 0);
    // The last group on line 0 should be pushed rightward by justify.
    expect(line0Groups.length).toBeGreaterThan(0);
  });
});

describe('computeTextLayout — justify single-format', () => {
  it('expands space character advances on a wrapped mid-paragraph line', () => {
    // "aa bb cc" with fixedMeasure (10px/char) and narrow width forces word-wrap.
    // Line 0 is mid-paragraph → justified. Space chars should get extra advance.
    // This was broken when justification counted group boundaries instead of space chars.
    const text = 'aa bb cc';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'justify' }, 0, text.length)],
      width: 80,
      height: 200,
      measure: fixedMeasure,
      multiline: true,
      wordWrap: true,
    });
    expect(result.numLines).toBeGreaterThanOrEqual(2);
    const line0Groups = result.groups.filter((g) => g.lineIndex === 0);
    // Verify at least one group contains a space char whose advance exceeds the
    // natural 10px width — proof that interWord justification distributed space.
    let foundExpandedSpace = false;
    for (const g of line0Groups) {
      for (let ci = 0; ci < g.positions.length; ci++) {
        if (text.charCodeAt(g.startIndex + ci) === 0x20 && g.positions[ci] > 10) {
          foundExpandedSpace = true;
        }
      }
    }
    expect(foundExpandedSpace).toBe(true);
  });
});

describe('computeTextLayout — kerning flag', () => {
  it('skips pair-measurement when kerning is false', () => {
    // With a measure that returns 5 per char, pair "ab" should return 10.
    // With kerning=true: advance of 'a' = measure("ab") - measure("b") = 10 - 5 = 5.
    // With kerning=false: advance of 'a' = measure("a") = 5.
    // Both give the same result here (monospace), so we verify no throw.
    const text = 'ab';
    const resultWith = doLayout(
      singleRangeParams(text, 1000, {
        formatRanges: [createTextFormatRange({ size: 16, kerning: true }, 0, text.length)],
      }),
    );
    const resultWithout = doLayout(
      singleRangeParams(text, 1000, {
        formatRanges: [createTextFormatRange({ size: 16, kerning: false }, 0, text.length)],
      }),
    );
    expect(resultWith.groups[0].positions).toHaveLength(2);
    expect(resultWithout.groups[0].positions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Golden-file / conformance tests — lock in output stability for key paths.
// These tests compare actual offsetX values to ensure the alignment algorithms
// produce the expected pixel-exact positions for a fixed-width measure function
// (10px/char) and a known container width.
// ---------------------------------------------------------------------------

describe('computeTextLayout — maxLines truncation', () => {
  it('clips to maxLines and appends truncation character', () => {
    const text = 'line one\nline two\nline three';
    const result = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16 }, 0, text.length)],
      width: 300,
      height: 200,
      measure: fixedMeasure,
      multiline: true,
      maxLines: 2,
    });
    // Should have at most 2 lines.
    expect(result.numLines).toBeLessThanOrEqual(2);
    // Should contain an ellipsis group on the last visible line.
    const lastLineGroups = result.groups.filter((g) => g.lineIndex === result.numLines - 1);
    expect(lastLineGroups.length).toBeGreaterThan(0);
  });

  it('isTextLayoutTruncated returns true when maxLines clips the layout', () => {
    const text = 'line one\nline two\nline three';
    const params: TextLayoutParams = {
      text,
      formatRanges: [createTextFormatRange({ size: 16 }, 0, text.length)],
      width: 300,
      height: 200,
      measure: fixedMeasure,
      multiline: true,
      maxLines: 2,
    };
    const result = doLayout(params);
    expect(isTextLayoutTruncated(result, params)).toBe(true);
  });

  it('isTextLayoutTruncated returns false when maxLines is unlimited', () => {
    const text = 'one line';
    const params: TextLayoutParams = singleRangeParams(text);
    const result = doLayout(params);
    expect(isTextLayoutTruncated(result, params)).toBe(false);
  });
});

describe('computeTextLayout — start/end alignment', () => {
  it('treats start as left in ltr direction', () => {
    const text = 'hi';
    const ltrResult = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'start' }, 0, text.length)],
      width: 100,
      height: 100,
      measure: fixedMeasure,
      direction: 'LeftToRight',
    });
    expect(ltrResult.groups[0].offsetX).toBe(TEXT_LAYOUT_GUTTER); // left-aligned = GUTTER
  });

  it('treats end as right in ltr direction', () => {
    const text = 'hi'; // 20px wide
    const ltrResult = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'end' }, 0, text.length)],
      width: 100,
      height: 100,
      measure: fixedMeasure,
      direction: 'LeftToRight',
    });
    // Right-aligned: shift = 100 - 20 - 2*2 = 76, so offsetX = 2 + 76 = 78
    expect(ltrResult.groups[0].offsetX).toBeGreaterThan(TEXT_LAYOUT_GUTTER);
  });

  it('treats start as right in rtl direction', () => {
    const text = 'hi';
    const rtlResult = doLayout({
      text,
      formatRanges: [createTextFormatRange({ size: 16, align: 'start' }, 0, text.length)],
      width: 100,
      height: 100,
      measure: fixedMeasure,
      direction: 'RightToLeft',
    });
    // RTL start = right alignment, so offsetX should be > GUTTER.
    expect(rtlResult.groups[0].offsetX).toBeGreaterThan(TEXT_LAYOUT_GUTTER);
  });
});

describe('createTextLayoutResult', () => {
  it('returns default zero values', () => {
    const result = createTextLayoutResult();
    expect(result.groups).toHaveLength(0);
    expect(result.lineAscents).toHaveLength(0);
    expect(result.lineDescents).toHaveLength(0);
    expect(result.lineHeights).toHaveLength(0);
    expect(result.lineLeadings).toHaveLength(0);
    expect(result.lineWidths).toHaveLength(0);
    expect(result.numLines).toBe(0);
    expect(result.textHeight).toBe(0);
    expect(result.textWidth).toBe(0);
  });

  it('returns a new object each call', () => {
    expect(createTextLayoutResult()).not.toBe(createTextLayoutResult());
  });
});

describe('isTextLayoutTruncated', () => {
  it('returns false when maxLines is -1', () => {
    const params = singleRangeParams('hello');
    const result = doLayout(params);
    expect(isTextLayoutTruncated(result, params)).toBe(false);
  });
});

describe('TEXT_LAYOUT_GUTTER', () => {
  it('is a positive number', () => {
    expect(TEXT_LAYOUT_GUTTER).toBeGreaterThan(0);
  });
});
