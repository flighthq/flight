// Generated from crates/flight-textlayout/tests/text_metrics_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { createTextLayoutResult, createTextMetrics, getTextMetrics, initializeTextMetrics } from './contract.ts';

describe('createTextMetrics', () => {
  it('creates a zeroed metrics object', () => {
    const metrics = createTextMetrics();
    expect([metrics.height, metrics.numLines, metrics.width]).toEqual([0.0, 0, 0.0]);
  });
});

describe('getTextMetrics', () => {
  it('fills the measured content size from a layout ceiling fractional extents', () => {
    let out = createTextMetrics();
    let layout = createTextLayoutResult();
    layout.numLines = 2;
    layout.textHeight = 8.7;
    layout.textWidth = 12.2;
    getTextMetrics(out, layout);
    expect([out.width, out.height, out.numLines]).toEqual([13.0, 9.0, 2]);
  });
});

describe('initializeTextMetrics', () => {
  it('is the construction initializer of create text metrics', () => {
    let out = createTextMetrics();
    out.height = 4.0;
    out.numLines = 5;
    out.width = 6.0;
    initializeTextMetrics(out);
    expect([out.height, out.numLines, out.width]).toEqual([0.0, 0, 0.0]);
  });
});
