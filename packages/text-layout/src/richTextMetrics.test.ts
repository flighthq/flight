import type { RichTextData, TextLayoutResult } from '@flighthq/types';

import {
  getRichTextBottomScrollV,
  getRichTextFieldHeight,
  getRichTextFieldWidth,
  getRichTextLineCount,
  getRichTextMaxScrollH,
  getRichTextMaxScrollV,
  getRichTextScrollYOffset,
  getRichTextTextHeight,
  getRichTextTextWidth,
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
    htmlText: '',
    maxChars: -1,
    mouseWheelEnabled: true,
    multiline: true,
    scrollH: 0,
    scrollV: 1,
    selectable: true,
    styleSheet: null,
    text: '',
    textColor: 0,
    textFormat: {},
    textFormatRanges: [],
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

describe('getRichTextBottomScrollV', () => {
  it('returns the last visible 1-based line', () => {
    const data = createData({ height: 34, scrollV: 2 });
    const layout = createLayout({ lineHeights: [10, 10, 10, 10], numLines: 4 });
    expect(getRichTextBottomScrollV(data, layout)).toBe(4);
  });

  it('clamps to the total line count', () => {
    const data = createData({ height: 80, scrollV: 2 });
    const layout = createLayout({ lineHeights: [10, 10, 10], numLines: 3 });
    expect(getRichTextBottomScrollV(data, layout)).toBe(3);
  });
});

describe('getRichTextFieldHeight', () => {
  it('uses data height when autoSize is none', () => {
    expect(getRichTextFieldHeight(createData({ autoSize: 'none', height: 80 }), createLayout())).toBe(80);
  });

  it('uses text height plus gutters when autoSize is enabled', () => {
    expect(getRichTextFieldHeight(createData({ autoSize: 'left' }), createLayout({ textHeight: 18 }))).toBe(22);
  });
});

describe('getRichTextFieldWidth', () => {
  it('uses data width when autoSize is none', () => {
    expect(getRichTextFieldWidth(createData({ autoSize: 'none', width: 120 }), createLayout())).toBe(120);
  });

  it('uses data width when wordWrap is enabled', () => {
    expect(getRichTextFieldWidth(createData({ autoSize: 'left', width: 120, wordWrap: true }), createLayout())).toBe(
      120,
    );
  });

  it('uses text width plus gutters when autoSize is enabled', () => {
    expect(getRichTextFieldWidth(createData({ autoSize: 'left' }), createLayout({ textWidth: 30 }))).toBe(34);
  });
});

describe('getRichTextLineCount', () => {
  it('returns the layout line count', () => {
    expect(getRichTextLineCount(createLayout({ numLines: 3 }))).toBe(3);
  });
});

describe('getRichTextMaxScrollH', () => {
  it('returns horizontal overflow beyond the visible field width', () => {
    const data = createData({ width: 54 });
    const layout = createLayout({ textWidth: 80 });
    expect(getRichTextMaxScrollH(data, layout)).toBe(30);
  });

  it('returns zero when text fits horizontally', () => {
    expect(getRichTextMaxScrollH(createData({ width: 100 }), createLayout({ textWidth: 50 }))).toBe(0);
  });
});

describe('getRichTextMaxScrollV', () => {
  it('returns the first scrollV where the final line is visible', () => {
    const data = createData({ height: 34 });
    const layout = createLayout({ lineHeights: [10, 10, 10, 10], numLines: 4 });
    expect(getRichTextMaxScrollV(data, layout)).toBe(2);
  });

  it('returns one for a single line', () => {
    expect(getRichTextMaxScrollV(createData(), createLayout({ numLines: 1 }))).toBe(1);
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

describe('getRichTextTextHeight', () => {
  it('returns the ceil text height', () => {
    expect(getRichTextTextHeight(createLayout({ textHeight: 12.2 }))).toBe(13);
  });
});

describe('getRichTextTextWidth', () => {
  it('returns the ceil text width', () => {
    expect(getRichTextTextWidth(createLayout({ textWidth: 21.1 }))).toBe(22);
  });
});
