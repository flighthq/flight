import type { RichTextData, TextLayoutResult } from '@flighthq/types';

import {
  computeRichTextBottomScrollV,
  computeRichTextLineCount,
  computeRichTextMaxScrollH,
  computeRichTextMaxScrollV,
  computeRichTextTextHeight,
  computeRichTextTextWidth,
  getRichTextScrollYOffset,
} from './richTextMetrics';

function createData(data: Partial<RichTextData> = {}): RichTextData {
  return {
    autoSize: 'none',
    background: false,
    backgroundColor: 0xffffff,
    border: false,
    borderColor: 0,
    condenseWhite: false,
    defaultTextFormat: {},
    height: 100,
    maxChars: -1,
    mouseWheelEnabled: true,
    multiline: true,
    scrollH: 0,
    scrollV: 1,
    selectable: true,
    text: '',
    textColor: 0,
    textFormat: {},
    textFormatRanges: [],
    verticalAlign: 'top',
    width: 200,
    wordWrap: false,
    ...data,
  };
}

function createLayout(layout: Partial<TextLayoutResult> = {}): TextLayoutResult {
  return {
    groups: [],
    lineAscents: [],
    lineDescents: [],
    lineHeights: [],
    lineLeadings: [],
    lineWidths: [],
    numLines: 1,
    textHeight: 20,
    textWidth: 50,
    ...layout,
  };
}

describe('computeRichTextBottomScrollV', () => {
  it('returns the last visible 1-based line', () => {
    const data = createData({ height: 34, scrollV: 2 });
    const layout = createLayout({ lineHeights: [10, 10, 10, 10], numLines: 4 });
    expect(computeRichTextBottomScrollV(data, layout)).toBe(4);
  });

  it('clamps to the total line count', () => {
    const data = createData({ height: 80, scrollV: 2 });
    const layout = createLayout({ lineHeights: [10, 10, 10], numLines: 3 });
    expect(computeRichTextBottomScrollV(data, layout)).toBe(3);
  });
});

describe('computeRichTextLineCount', () => {
  it('returns the layout line count', () => {
    expect(computeRichTextLineCount(createLayout({ numLines: 3 }))).toBe(3);
  });
});

describe('computeRichTextMaxScrollH', () => {
  it('returns horizontal overflow beyond the visible field width', () => {
    const data = createData({ width: 54 });
    const layout = createLayout({ textWidth: 80 });
    expect(computeRichTextMaxScrollH(data, layout)).toBe(30);
  });

  it('returns zero when text fits horizontally', () => {
    expect(computeRichTextMaxScrollH(createData({ width: 100 }), createLayout({ textWidth: 50 }))).toBe(0);
  });
});

describe('computeRichTextMaxScrollV', () => {
  it('returns the first scrollV where the final line is visible', () => {
    const data = createData({ height: 34 });
    const layout = createLayout({ lineHeights: [10, 10, 10, 10], numLines: 4 });
    expect(computeRichTextMaxScrollV(data, layout)).toBe(2);
  });

  it('returns one for a single line', () => {
    expect(computeRichTextMaxScrollV(createData(), createLayout({ numLines: 1 }))).toBe(1);
  });
});

describe('computeRichTextTextHeight', () => {
  it('returns the ceil text height', () => {
    expect(computeRichTextTextHeight(createLayout({ textHeight: 12.2 }))).toBe(13);
  });
});

describe('computeRichTextTextWidth', () => {
  it('returns the ceil text width', () => {
    expect(computeRichTextTextWidth(createLayout({ textWidth: 21.1 }))).toBe(22);
  });
});

describe('getRichTextScrollYOffset', () => {
  it('returns 0 when firstVisibleLine is 0', () => {
    expect(getRichTextScrollYOffset([10, 12, 14], 0)).toBe(0);
  });

  it('returns the sum of the first N line heights', () => {
    expect(getRichTextScrollYOffset([10, 12, 14], 2)).toBe(22);
  });

  it('clamps to the available line count', () => {
    expect(getRichTextScrollYOffset([10, 12], 5)).toBe(22);
  });
});
