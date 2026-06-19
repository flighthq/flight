import type { RectangleLike, TextLayoutResult } from '@flighthq/types';

import type { TextBoundsSpec } from './textBounds';
import {
  computeTextBoundsHeight,
  computeTextBoundsOffsetX,
  computeTextBoundsRectangle,
  computeTextBoundsWidth,
} from './textBounds';

function createSpec(spec: Partial<TextBoundsSpec> = {}): TextBoundsSpec {
  return {
    autoSize: 'none',
    height: 100,
    width: 200,
    wordWrap: false,
    ...spec,
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

describe('computeTextBoundsHeight', () => {
  it('uses spec height when autoSize is none', () => {
    expect(computeTextBoundsHeight(createSpec({ autoSize: 'none', height: 80 }), createLayout())).toBe(80);
  });

  it('uses text height plus gutters when autoSize is enabled', () => {
    expect(computeTextBoundsHeight(createSpec({ autoSize: 'left' }), createLayout({ textHeight: 18 }))).toBe(22);
  });
});

describe('computeTextBoundsOffsetX', () => {
  it('returns zero for left and none anchoring', () => {
    expect(
      computeTextBoundsOffsetX(createSpec({ autoSize: 'left', width: 120 }), createLayout({ textWidth: 30 })),
    ).toBe(0);
  });

  it('shifts the box fully into the slack for right anchoring', () => {
    expect(
      computeTextBoundsOffsetX(createSpec({ autoSize: 'right', width: 120 }), createLayout({ textWidth: 30 })),
    ).toBe(86);
  });

  it('splits the slack for center anchoring', () => {
    expect(
      computeTextBoundsOffsetX(createSpec({ autoSize: 'center', width: 120 }), createLayout({ textWidth: 30 })),
    ).toBe(43);
  });
});

describe('computeTextBoundsRectangle', () => {
  it('fills the declared box at the origin when autoSize is none', () => {
    const out: RectangleLike = { height: 0, width: 0, x: 0, y: 0 };
    computeTextBoundsRectangle(out, createSpec({ autoSize: 'none', width: 120, height: 80 }), createLayout());
    expect(out).toEqual({ height: 80, width: 120, x: 0, y: 0 });
  });

  it('fills the measured box with the anchor offset under autoSize', () => {
    const out: RectangleLike = { height: 0, width: 0, x: 0, y: 0 };
    computeTextBoundsRectangle(
      out,
      createSpec({ autoSize: 'right', width: 120 }),
      createLayout({ textWidth: 30, textHeight: 18 }),
    );
    expect(out).toEqual({ height: 22, width: 34, x: 86, y: 0 });
  });
});

describe('computeTextBoundsWidth', () => {
  it('uses spec width when autoSize is none', () => {
    expect(computeTextBoundsWidth(createSpec({ autoSize: 'none', width: 120 }), createLayout())).toBe(120);
  });

  it('uses spec width when wordWrap is enabled', () => {
    expect(computeTextBoundsWidth(createSpec({ autoSize: 'left', width: 120, wordWrap: true }), createLayout())).toBe(
      120,
    );
  });

  it('uses text width plus gutters when autoSize is enabled', () => {
    expect(computeTextBoundsWidth(createSpec({ autoSize: 'left' }), createLayout({ textWidth: 30 }))).toBe(34);
  });
});
