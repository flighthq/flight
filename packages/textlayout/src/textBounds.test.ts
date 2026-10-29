// Generated from crates/flight-textlayout/tests/text_bounds_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRectangle } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  TEXT_BOUNDS_GUTTER,
  TEXT_LAYOUT_GUTTER,
  computeTextBoundsHeight,
  computeTextBoundsOffsetX,
  computeTextBoundsRectangle,
  computeTextBoundsWidth,
  createTextLayoutResult,
} from './contract.ts';
import type { TextAutoSize, TextBoundsSpec, TextLayoutResult } from './contract.ts';

function createLayout(textHeight: number, textWidth: number): TextLayoutResult {
  let layout = createTextLayoutResult();
  layout.numLines = 1;
  layout.textHeight = textHeight;
  layout.textWidth = textWidth;
  return layout;
}

function createSpec(autoSize: TextAutoSize, height: number, width: number, wordWrap: boolean): TextBoundsSpec {
  return { autoSize: autoSize, height: height, width: width, wordWrap: wordWrap };
}

describe('computeTextBoundsHeight', () => {
  it('uses spec height when auto size is none', () => {
    expect(computeTextBoundsHeight(createSpec('none', 80.0, 200.0, false), createLayout(20.0, 50.0))).toEqual(80.0);
  });
  it('uses text height plus gutters when auto size is enabled', () => {
    expect(computeTextBoundsHeight(createSpec('left', 100.0, 200.0, false), createLayout(18.0, 50.0))).toEqual(22.0);
  });
});

describe('computeTextBoundsOffsetX', () => {
  it('returns zero for left and none anchoring', () => {
    expect(computeTextBoundsOffsetX(createSpec('left', 100.0, 120.0, false), createLayout(20.0, 30.0))).toEqual(0.0);
  });
  it('shifts the box fully into the slack for right anchoring', () => {
    expect(computeTextBoundsOffsetX(createSpec('right', 100.0, 120.0, false), createLayout(20.0, 30.0))).toEqual(86.0);
  });
  it('splits the slack for center anchoring', () => {
    expect(computeTextBoundsOffsetX(createSpec('center', 100.0, 120.0, false), createLayout(20.0, 30.0))).toEqual(43.0);
  });
});

describe('computeTextBoundsRectangle', () => {
  it('fills the declared box at the origin when auto size is none', () => {
    let out = createRectangle(0.0, 0.0, 0.0, 0.0);
    computeTextBoundsRectangle(out, createSpec('none', 80.0, 120.0, false), createLayout(20.0, 50.0));
    expect([out.height, out.width, out.x, out.y]).toEqual([80.0, 120.0, 0.0, 0.0]);
  });
  it('fills the measured box with the anchor offset under auto size', () => {
    let out = createRectangle(0.0, 0.0, 0.0, 0.0);
    computeTextBoundsRectangle(out, createSpec('right', 100.0, 120.0, false), createLayout(18.0, 30.0));
    expect([out.height, out.width, out.x, out.y]).toEqual([22.0, 34.0, 86.0, 0.0]);
  });
});

describe('computeTextBoundsWidth', () => {
  it('uses spec width when auto size is none', () => {
    expect(computeTextBoundsWidth(createSpec('none', 100.0, 120.0, false), createLayout(20.0, 50.0))).toEqual(120.0);
  });
  it('uses spec width when word wrap is enabled', () => {
    expect(computeTextBoundsWidth(createSpec('left', 100.0, 120.0, true), createLayout(20.0, 50.0))).toEqual(120.0);
  });
  it('uses text width plus gutters when auto size is enabled', () => {
    expect(computeTextBoundsWidth(createSpec('left', 100.0, 200.0, false), createLayout(20.0, 30.0))).toEqual(34.0);
  });
});

describe('textBoundsGutter', () => {
  it('equals text layout gutter', () => {
    expect(TEXT_BOUNDS_GUTTER).toEqual(TEXT_LAYOUT_GUTTER);
  });
});
