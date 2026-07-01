import type { TextLayoutResult, TextSelectionRectangle } from '@flighthq/types';

import {
  computeRichTextCharIndexAtPoint,
  computeRichTextLineMetrics,
  getRichTextCharBoundaries,
  getRichTextFirstCharInParagraph,
  getRichTextLineIndexAtPoint,
  getRichTextLineIndexOfChar,
  getRichTextLineLength,
  getRichTextLineOffset,
  getRichTextLineText,
  getRichTextLinkAtPoint,
  getRichTextParagraphLength,
  getRichTextSelectionRectangles,
} from './richTextQuery';

// Two-line layout: 'abc' on line 0 (indices 0-3), 'defg' on line 1 (indices 3-7).
function createLayout(): TextLayoutResult {
  return {
    groups: [
      {
        ascent: 10,
        descent: 2,
        endIndex: 3,
        format: {},
        height: 12,
        leading: 0,
        lineIndex: 0,
        offsetX: 0,
        offsetY: 2,
        positions: [10, 10, 10],
        startIndex: 0,
        width: 30,
      },
      {
        ascent: 10,
        descent: 2,
        endIndex: 7,
        format: { url: 'https://example.com' },
        height: 12,
        leading: 0,
        lineIndex: 1,
        offsetX: 0,
        offsetY: 16,
        positions: [10, 10, 10, 10],
        startIndex: 3,
        width: 40,
      },
    ],
    lineAscents: [10, 10],
    lineDescents: [2, 2],
    lineHeights: [14, 14],
    lineLeadings: [0, 0],
    lineWidths: [30, 40],
    numLines: 2,
    textHeight: 28,
    textWidth: 40,
  };
}

describe('computeRichTextCharIndexAtPoint', () => {
  it('returns the index at a point within a group', () => {
    expect(computeRichTextCharIndexAtPoint('abcdefg', createLayout(), 25, 5)).toBe(2);
  });

  it('selects the closest line by y distance', () => {
    expect(computeRichTextCharIndexAtPoint('abcdefg', createLayout(), 5, 100)).toBe(7);
  });
});

describe('computeRichTextLineMetrics', () => {
  it('returns metrics for a valid line', () => {
    const metrics = computeRichTextLineMetrics(createLayout(), 0);
    expect(metrics).not.toBeNull();
    expect(metrics!.ascent).toBe(10);
    expect(metrics!.descent).toBe(2);
    expect(metrics!.width).toBe(30);
  });

  it('returns null for a non-existent line', () => {
    expect(computeRichTextLineMetrics(createLayout(), 5)).toBeNull();
  });
});

describe('getRichTextCharBoundaries', () => {
  it('fills out with the bounding box of the character', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const found = getRichTextCharBoundaries(out as never, 'abcdefg', createLayout(), 1);
    expect(found).toBe(true);
    expect(out.x).toBe(10);
    expect(out.y).toBe(2);
    expect(out.width).toBe(10);
    expect(out.height).toBe(12);
  });

  it('returns false for an out-of-range index', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    expect(getRichTextCharBoundaries(out as never, '', createLayout(), 99)).toBe(false);
  });
});

describe('getRichTextFirstCharInParagraph', () => {
  it('returns 0 at the start of the first paragraph', () => {
    expect(getRichTextFirstCharInParagraph('hello\nworld', 3)).toBe(0);
  });

  it('returns the position after the newline for a later paragraph', () => {
    expect(getRichTextFirstCharInParagraph('hello\nworld', 8)).toBe(6);
  });
});

describe('getRichTextLineIndexAtPoint', () => {
  it('returns 0 for a y value within the first line', () => {
    expect(getRichTextLineIndexAtPoint(createLayout(), 5)).toBe(0);
  });

  it('returns 1 for a y value within the second line', () => {
    expect(getRichTextLineIndexAtPoint(createLayout(), 18)).toBe(1);
  });
});

describe('getRichTextLineIndexOfChar', () => {
  it('returns 0 for a character on the first line', () => {
    expect(getRichTextLineIndexOfChar(createLayout(), 1)).toBe(0);
  });

  it('returns 1 for a character on the second line', () => {
    expect(getRichTextLineIndexOfChar(createLayout(), 5)).toBe(1);
  });
});

describe('getRichTextLineLength', () => {
  it('returns the character count of the requested line', () => {
    expect(getRichTextLineLength(createLayout(), 0)).toBe(3);
    expect(getRichTextLineLength(createLayout(), 1)).toBe(4);
  });

  it('returns 0 for a non-existent line', () => {
    expect(getRichTextLineLength(createLayout(), 5)).toBe(0);
  });
});

describe('getRichTextLineOffset', () => {
  it('returns the start index of the requested line', () => {
    expect(getRichTextLineOffset(createLayout(), 0)).toBe(0);
    expect(getRichTextLineOffset(createLayout(), 1)).toBe(3);
  });
});

describe('getRichTextLineText', () => {
  it('returns the text slice for the requested line', () => {
    expect(getRichTextLineText('abcdefg', createLayout(), 0)).toBe('abc');
    expect(getRichTextLineText('abcdefg', createLayout(), 1)).toBe('defg');
  });

  it('returns empty string for a non-existent line', () => {
    expect(getRichTextLineText('abcdefg', createLayout(), 5)).toBe('');
  });
});

describe('getRichTextLinkAtPoint', () => {
  it('returns the url when the point hits a group with a url', () => {
    expect(getRichTextLinkAtPoint(createLayout(), 10, 18)).toBe('https://example.com');
  });

  it('returns null when the point does not hit a linked group', () => {
    expect(getRichTextLinkAtPoint(createLayout(), 10, 5)).toBeNull();
  });
});

describe('getRichTextParagraphLength', () => {
  it('returns the length including the newline', () => {
    expect(getRichTextParagraphLength('hello\nworld', 3)).toBe(6);
  });

  it('returns to end of string when there is no trailing newline', () => {
    expect(getRichTextParagraphLength('hello\nworld', 8)).toBe(5);
  });
});

describe('getRichTextSelectionRectangles', () => {
  it('fills out with one rectangle per intersected group', () => {
    const out: TextSelectionRectangle[] = [];
    getRichTextSelectionRectangles(out, 1, 5, createLayout());
    expect(out).toHaveLength(2);
    expect(out[0].lineIndex).toBe(0);
    expect(out[1].lineIndex).toBe(1);
  });

  it('returns empty for a collapsed selection', () => {
    const out: TextSelectionRectangle[] = [];
    getRichTextSelectionRectangles(out, 2, 2, createLayout());
    expect(out).toHaveLength(0);
  });
});
