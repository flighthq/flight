import { createGlyphAtlas, createGlyphSourceFromGlyphAtlas } from '@flighthq/glyphatlas/contract';
import { setLogSink } from '@flighthq/log/contract';
import type { GlyphAtlas, GlyphRasterizerBackend, LogEntry } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createBitmapText } from './bitmapText';
import { disableBitmapTextGuards, enableBitmapTextGuards } from './enableBitmapTextGuards';
import { updateBitmapText } from './updateBitmapText';

let entries: LogEntry[];

beforeEach(() => {
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableBitmapTextGuards();
  setLogSink(null);
});

function messages(): string {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

// Holds exactly nine 8x8 glyphs, so a string of more distinct characters than that can never have all
// of them resident at once: laying out its tail evicts its head, every pass invalidates the last, and
// the layout cannot settle however many passes it is given.
function createTinyGlyphAtlas(): GlyphAtlas {
  const backend: GlyphRasterizerBackend = {
    rasterize: () => ({
      advance: 8,
      bearingX: 0,
      bearingY: 8,
      height: 8,
      pixels: new Uint8ClampedArray(8 * 8 * 4),
      width: 8,
    }),
  };
  return createGlyphAtlas({
    fontFamily: 'block',
    fontSize: 8,
    height: 32,
    padding: 1,
    rasterizerBackend: backend,
    width: 32,
  });
}

describe('disableBitmapTextGuards', () => {
  it('stops the guard reporting later layouts', () => {
    enableBitmapTextGuards();
    disableBitmapTextGuards();
    const source = createGlyphSourceFromGlyphAtlas(createTinyGlyphAtlas());
    updateBitmapText(createBitmapText(source, { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }));
    expect(messages()).toBe('');
  });
});

describe('enableBitmapTextGuards', () => {
  it('says nothing for a layout that settles', () => {
    enableBitmapTextGuards();
    const source = createGlyphSourceFromGlyphAtlas(createTinyGlyphAtlas());
    updateBitmapText(createBitmapText(source, { text: 'ABC' }));
    expect(messages()).toBe('');
  });

  // Without this the failure is silent and looks like a rendering bug: the text draws, every quad is
  // where layout put it, and the pixels under them belong to other glyphs.
  it('warns when a string needs more glyphs at once than the atlas can hold', () => {
    enableBitmapTextGuards();
    const source = createGlyphSourceFromGlyphAtlas(createTinyGlyphAtlas());
    updateBitmapText(createBitmapText(source, { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }));
    expect(messages()).toContain('never settled');
    expect(messages()).toContain('Enlarge the glyph atlas');
  });
});
