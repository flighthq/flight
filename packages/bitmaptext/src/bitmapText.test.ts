import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { createRectangle } from '@flighthq/geometry';
import { getQuadBatchCapacity } from '@flighthq/sprite';
import type { BitmapTextRuntime, GlyphEntry, GlyphSource } from '@flighthq/types';
import { BitmapTextKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  computeBitmapTextLocalBoundsRectangle,
  createBitmapText,
  createBitmapTextData,
  createBitmapTextRuntime,
  getBitmapTextBounds,
  getBitmapTextQuadBatch,
  reserveBitmapText,
  setBitmapTextAlign,
  setBitmapTextColor,
  setBitmapTextGlyphSource,
  setBitmapTextLetterSpacing,
  setBitmapTextLineHeight,
  setBitmapTextText,
  setBitmapTextWrapWidth,
} from './bitmapText';
import { updateBitmapText } from './updateBitmapText';

function createTestGlyphSource(): GlyphSource {
  const entries = new Map<number, GlyphEntry>();
  const add = (cp: number, x: number): void => {
    entries.set(cp, { advance: 10, bearingX: 0, bearingY: 8, height: 8, width: 6, x, y: 0 });
  };
  add(0x41, 0); // A
  add(0x42, 6); // B
  entries.set(0x20, { advance: 5, bearingX: 0, bearingY: 0, height: 0, width: 0, x: 0, y: 0 }); // space
  return {
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

describe('computeBitmapTextLocalBoundsRectangle', () => {
  it('writes the laid-out text extent into a distinct out rectangle', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'A' });
    updateBitmapText(text);
    const out = createRectangle();
    computeBitmapTextLocalBoundsRectangle(out, text);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(6);
    expect(out.height).toBe(8);
  });

  it('is safe when out aliases the cached bounds rectangle', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'A' });
    updateBitmapText(text);
    const cached = (getDisplayObjectRuntime(text) as BitmapTextRuntime).localBoundsRectangle;
    expect(cached).not.toBeNull();
    computeBitmapTextLocalBoundsRectangle(cached!, text);
    expect(cached!.width).toBe(6);
    expect(cached!.height).toBe(8);
  });

  it('writes zeros before the first layout', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    const out = createRectangle();
    out.width = 99;
    computeBitmapTextLocalBoundsRectangle(out, text);
    expect(out.width).toBe(0);
  });
});

describe('createBitmapText', () => {
  it('creates a BitmapText node with a backing QuadBatch child', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    expect(text.kind).toBe(BitmapTextKind);
    const quadBatch = getBitmapTextQuadBatch(text);
    expect(quadBatch).not.toBeNull();
    expect(getDisplayObjectRuntime(text).children).toContain(quadBatch);
  });

  it('applies construction options to node data', () => {
    const text = createBitmapText(createTestGlyphSource(), null, {
      align: 'center',
      color: 0xff0000ff,
      letterSpacing: 2,
      lineHeight: 1.5,
      text: 'Hi',
      wrapWidth: 120,
    });
    expect(text.data.align).toBe('center');
    expect(text.data.color).toBe(0xff0000ff);
    expect(text.data.letterSpacing).toBe(2);
    expect(text.data.lineHeight).toBe(1.5);
    expect(text.data.text).toBe('Hi');
    expect(text.data.wrapWidth).toBe(120);
  });

  it('binds the supplied glyph source', () => {
    const glyphSource = createTestGlyphSource();
    const text = createBitmapText(glyphSource, null);
    expect(text.data.glyphSource).toBe(glyphSource);
  });
});

describe('createBitmapTextData', () => {
  it('defaults to left-aligned white empty unwrapped text', () => {
    const data = createBitmapTextData();
    expect(data.align).toBe('left');
    expect(data.color).toBe(0xffffffff);
    expect(data.glyphSource).toBeNull();
    expect(data.letterSpacing).toBe(0);
    expect(data.lineHeight).toBe(1);
    expect(data.text).toBe('');
    expect(data.wrapWidth).toBeNull();
  });

  it('honors provided overrides', () => {
    const data = createBitmapTextData({ align: 'right', text: 'x', wrapWidth: 50 });
    expect(data.align).toBe('right');
    expect(data.text).toBe('x');
    expect(data.wrapWidth).toBe(50);
  });
});

describe('createBitmapTextRuntime', () => {
  it('starts with null bounds and quad batch', () => {
    const runtime = createBitmapTextRuntime();
    expect(runtime.localBoundsRectangle).toBeNull();
    expect(runtime.quadBatch).toBeNull();
  });
});

describe('getBitmapTextBounds', () => {
  it('allocates a rectangle covering the laid-out glyphs', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB' });
    updateBitmapText(text);
    const bounds = getBitmapTextBounds(text);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(16); // B at x=10, region width 6 → right edge 16
    expect(bounds.height).toBe(8);
  });
});

describe('getBitmapTextQuadBatch', () => {
  it('returns the backing batch instance', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    expect(getBitmapTextQuadBatch(text)).toBe(getDisplayObjectRuntime(text).children![0]);
  });
});

describe('reserveBitmapText', () => {
  it('grows the backing quad batch capacity', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    reserveBitmapText(text, 64);
    expect(getQuadBatchCapacity(getBitmapTextQuadBatch(text)!)).toBeGreaterThanOrEqual(64);
  });
});

describe('setBitmapTextAlign', () => {
  it('mutates the align field', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    setBitmapTextAlign(text, 'justify');
    expect(text.data.align).toBe('justify');
  });
});

describe('setBitmapTextColor', () => {
  it('mutates the color field', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    setBitmapTextColor(text, 0x00ff00ff);
    expect(text.data.color).toBe(0x00ff00ff);
  });
});

describe('setBitmapTextGlyphSource', () => {
  it('rebinds the glyph source', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    const next = createTestGlyphSource();
    setBitmapTextGlyphSource(text, next);
    expect(text.data.glyphSource).toBe(next);
  });
});

describe('setBitmapTextLetterSpacing', () => {
  it('mutates the letterSpacing field', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    setBitmapTextLetterSpacing(text, 3);
    expect(text.data.letterSpacing).toBe(3);
  });
});

describe('setBitmapTextLineHeight', () => {
  it('mutates the lineHeight field', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    setBitmapTextLineHeight(text, 2);
    expect(text.data.lineHeight).toBe(2);
  });
});

describe('setBitmapTextText', () => {
  it('mutates the text field', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    setBitmapTextText(text, 'changed');
    expect(text.data.text).toBe('changed');
  });
});

describe('setBitmapTextWrapWidth', () => {
  it('mutates the wrapWidth field', () => {
    const text = createBitmapText(createTestGlyphSource(), null);
    setBitmapTextWrapWidth(text, 200);
    expect(text.data.wrapWidth).toBe(200);
    setBitmapTextWrapWidth(text, null);
    expect(text.data.wrapWidth).toBeNull();
  });
});
