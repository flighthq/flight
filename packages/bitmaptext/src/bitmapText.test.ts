import { createRectangle } from '@flighthq/geometry/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { BitmapTextRuntime, GlyphEntry, GlyphSource, ImageResource } from '@flighthq/types/contract';
import { BitmapTextKind, EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  computeBitmapTextLocalBoundsRectangle,
  createBitmapText,
  createBitmapTextData,
  createBitmapTextRuntime,
  getBitmapTextBounds,
  getBitmapTextPages,
  isBitmapTextGlyphLayoutStale,
  reserveBitmapText,
  setBitmapTextAlign,
  setBitmapTextGlyphSource,
  setBitmapTextLetterSpacing,
  setBitmapTextLineHeight,
  setBitmapTextText,
  setBitmapTextWrapWidth,
} from './bitmapText';
import { updateBitmapText } from './updateBitmapText';

// A single-page glyph source: A/B are 6x8, a space advances 5, and page 0 is a stub `ImageResource`.
function createTestGlyphSource(): GlyphSource {
  const entries = new Map<number, GlyphEntry>();
  const add = (cp: number, x: number): void => {
    entries.set(cp, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x, y: 0 });
  };
  add(0x41, 0); // A
  add(0x42, 6); // B
  entries.set(0x20, { advance: 5, bearingX: 0, bearingY: 0, height: 0, page: 0, width: 0, x: 0, y: 0 }); // space
  const image = {} as ImageResource;
  return {
    [EntityRuntimeKey]: undefined,
    getGlyphAtlasImage: (page = 0) => (page === 0 ? image : null),
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: () => 0,
    getGlyphLayoutVersion: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

describe('computeBitmapTextLocalBoundsRectangle', () => {
  it('writes the laid-out text extent into a distinct out rectangle', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A' });
    updateBitmapText(text);
    const out = createRectangle();
    computeBitmapTextLocalBoundsRectangle(out, text);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(6);
    expect(out.height).toBe(8);
  });

  it('is safe when out aliases the cached bounds rectangle', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A' });
    updateBitmapText(text);
    const cached = (getNode2DRuntime(text) as BitmapTextRuntime).localBoundsRectangle;
    expect(cached).not.toBeNull();
    computeBitmapTextLocalBoundsRectangle(cached!, text);
    expect(cached!.width).toBe(6);
    expect(cached!.height).toBe(8);
  });

  it('writes zeros before the first layout', () => {
    const text = createBitmapText(createTestGlyphSource());
    const out = createRectangle();
    out.width = 99;
    computeBitmapTextLocalBoundsRectangle(out, text);
    expect(out.width).toBe(0);
  });
});

describe('createBitmapText', () => {
  it('creates a BitmapText leaf owning one page and no child nodes', () => {
    const text = createBitmapText(createTestGlyphSource());
    expect(text.kind).toBe(BitmapTextKind);
    expect(getBitmapTextPages(text)).toHaveLength(1);
    const children = getNode2DRuntime(text).children;
    expect(children == null || children.length === 0).toBe(true);
  });

  it('applies construction options to node data', () => {
    const text = createBitmapText(createTestGlyphSource(), {
      align: 'center',
      letterSpacing: 2,
      lineHeight: 1.5,
      text: 'Hi',
      wrapWidth: 120,
    });
    expect(text.data.align).toBe('center');
    expect(text.data.letterSpacing).toBe(2);
    expect(text.data.lineHeight).toBe(1.5);
    expect(text.data.text).toBe('Hi');
    expect(text.data.wrapWidth).toBe(120);
  });

  it('binds the supplied glyph source', () => {
    const glyphSource = createTestGlyphSource();
    const text = createBitmapText(glyphSource);
    expect(text.data.glyphSource).toBe(glyphSource);
  });
});

describe('createBitmapTextData', () => {
  it('defaults to left-aligned empty unwrapped text', () => {
    const data = createBitmapTextData();
    expect(data.align).toBe('left');
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
  it('starts with null bounds and no pages', () => {
    const runtime = createBitmapTextRuntime();
    expect(runtime.localBoundsRectangle).toBeNull();
    expect(runtime.pages).toEqual([]);
    // Below every real version, so a node that has never been laid out reads stale.
    expect(runtime.glyphLayoutVersion).toBe(-1);
  });
});

describe('getBitmapTextBounds', () => {
  it('allocates a rectangle covering the laid-out glyphs', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    const bounds = getBitmapTextBounds(text);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(16); // B at x=10, region width 6 → right edge 16
    expect(bounds.height).toBe(8);
  });
});

describe('getBitmapTextPages', () => {
  it('returns the owned pages in page order', () => {
    const text = createBitmapText(createTestGlyphSource());
    const pages = getBitmapTextPages(text);
    expect(pages).toHaveLength(1);
    expect(pages[0].instanceCount).toBe(0);
  });
});

describe('isBitmapTextGlyphLayoutStale', () => {
  it('reads stale before the first layout and settled after it', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    expect(isBitmapTextGlyphLayoutStale(text)).toBe(true);
    updateBitmapText(text);
    expect(isBitmapTextGlyphLayoutStale(text)).toBe(false);
  });

  // A node with nothing bound has no rects to go stale, so it must not report work to do — otherwise
  // a per-frame refresh would re-lay-out every empty node in the scene forever.
  it('reads settled for a node with no glyph source', () => {
    expect(isBitmapTextGlyphLayoutStale(createBitmapText(null, { text: 'AB' }))).toBe(false);
  });

  // Version numbering is per source, so a stamp from one source says nothing about another and this
  // query does NOT detect a rebind: two sources at version 0 compare equal. That is why
  // `setBitmapTextGlyphSource` documents an explicit `updateBitmapText` afterwards rather than leaving
  // the rebind to the refresh path. Asserted so a later reader does not mistake the gap for coverage.
  it('does not report a rebound glyph source as stale', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);

    setBitmapTextGlyphSource(text, createTestGlyphSource());

    expect(isBitmapTextGlyphLayoutStale(text)).toBe(false);
  });
});

describe('reserveBitmapText', () => {
  it('grows each page quad-array capacity', () => {
    const text = createBitmapText(createTestGlyphSource());
    reserveBitmapText(text, 64);
    const page = getBitmapTextPages(text)[0];
    expect(page.ids.length).toBeGreaterThanOrEqual(64);
    expect(page.transforms.length).toBeGreaterThanOrEqual(128);
  });
});

describe('setBitmapTextAlign', () => {
  it('mutates the align field', () => {
    const text = createBitmapText(createTestGlyphSource());
    setBitmapTextAlign(text, 'justify');
    expect(text.data.align).toBe('justify');
  });
});

describe('setBitmapTextGlyphSource', () => {
  it('rebinds the glyph source', () => {
    const text = createBitmapText(createTestGlyphSource());
    const next = createTestGlyphSource();
    setBitmapTextGlyphSource(text, next);
    expect(text.data.glyphSource).toBe(next);
  });
});

describe('setBitmapTextLetterSpacing', () => {
  it('mutates the letterSpacing field', () => {
    const text = createBitmapText(createTestGlyphSource());
    setBitmapTextLetterSpacing(text, 3);
    expect(text.data.letterSpacing).toBe(3);
  });
});

describe('setBitmapTextLineHeight', () => {
  it('mutates the lineHeight field', () => {
    const text = createBitmapText(createTestGlyphSource());
    setBitmapTextLineHeight(text, 2);
    expect(text.data.lineHeight).toBe(2);
  });
});

describe('setBitmapTextText', () => {
  it('mutates the text field', () => {
    const text = createBitmapText(createTestGlyphSource());
    setBitmapTextText(text, 'changed');
    expect(text.data.text).toBe('changed');
  });
});

describe('setBitmapTextWrapWidth', () => {
  it('mutates the wrapWidth field', () => {
    const text = createBitmapText(createTestGlyphSource());
    setBitmapTextWrapWidth(text, 200);
    expect(text.data.wrapWidth).toBe(200);
    setBitmapTextWrapWidth(text, null);
    expect(text.data.wrapWidth).toBeNull();
  });
});
