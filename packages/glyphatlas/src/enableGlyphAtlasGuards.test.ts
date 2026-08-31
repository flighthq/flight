import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { GlyphRasterizerBackend, LogEntry } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { disableGlyphAtlasGuards, enableGlyphAtlasGuards } from './enableGlyphAtlasGuards';
import { createGlyphAtlas } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { setGlyphRasterizerBackend } from './glyphRasterizerBackend';

let entries: LogEntry[];

beforeEach(() => {
  clearLogOnceKeys();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableGlyphAtlasGuards();
  setGlyphRasterizerBackend(null);
  setLogSink(null);
});

function messages(): string {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

function backendProducing(width: number, height: number): GlyphRasterizerBackend {
  return {
    rasterize: () => ({
      advance: width,
      bearingX: 0,
      bearingY: 0,
      height,
      pixels: new Uint8ClampedArray(width * height * 4),
      width,
    }),
  };
}

describe('disableGlyphAtlasGuards', () => {
  it('stops the guard reporting later lookups', () => {
    enableGlyphAtlasGuards();
    disableGlyphAtlasGuards();
    setGlyphRasterizerBackend({ rasterize: () => null });
    getGlyphAtlasEntry(createGlyphAtlas({ fontFamily: 'm', fontSize: 16, height: 64, width: 64 }), 65);
    expect(messages()).toBe('');
  });
});

describe('enableGlyphAtlasGuards', () => {
  it('says nothing when the glyph renders', () => {
    enableGlyphAtlasGuards();
    setGlyphRasterizerBackend(backendProducing(8, 8));
    getGlyphAtlasEntry(createGlyphAtlas({ fontFamily: 'm', fontSize: 16, height: 64, width: 64 }), 65);
    expect(messages()).toBe('');
  });

  it('warns when the rasterizer produces nothing', () => {
    enableGlyphAtlasGuards();
    setGlyphRasterizerBackend({ rasterize: () => null });
    getGlyphAtlasEntry(createGlyphAtlas({ fontFamily: 'm', fontSize: 16, height: 64, width: 64 }), 0x41);
    // The codepoint is asserted here rather than in its own test: logOnce suppresses a key for the
    // process, so a second test tripping the same key would pass or fail on file order alone.
    expect(messages()).toContain('rasterizer produced nothing');
    expect(messages()).toContain('U+0041');
  });

  // The two null paths must not report the same thing: one wants a different font or host, the other a
  // bigger atlas, and a single message would send the caller to the wrong remedy.
  it('warns distinctly when the glyph is larger than the atlas', () => {
    enableGlyphAtlasGuards();
    setGlyphRasterizerBackend(backendProducing(200, 8));
    getGlyphAtlasEntry(createGlyphAtlas({ fontFamily: 'm', fontSize: 16, height: 64, width: 64 }), 65);
    expect(messages()).toContain('larger than the atlas');
    expect(messages()).not.toContain('rasterizer produced nothing');
  });

  // An atlas settling — one or two repacks as it fills, then a working set that fits — is normal, and
  // warning on it would train the caller to ignore the message that matters.
  it('says nothing about the first repacks an atlas needs to settle', () => {
    enableGlyphAtlasGuards();
    setGlyphRasterizerBackend(backendProducing(8, 8));
    const atlas = createGlyphAtlas({ fontFamily: 'm', fontSize: 8, height: 32, padding: 1, width: 32 });
    // Nine 8x8 glyphs fill the atlas exactly; the next two force one repack each.
    for (let codepoint = 65; codepoint < 76; codepoint++) getGlyphAtlasEntry(atlas, codepoint);
    expect(atlas.runtime.layoutVersion).toBe(2);
    expect(messages()).toBe('');
  });

  it('warns once the repacks pass the point of an atlas settling', () => {
    enableGlyphAtlasGuards();
    setGlyphRasterizerBackend(backendProducing(8, 8));
    const atlas = createGlyphAtlas({ fontFamily: 'm', fontSize: 8, height: 32, padding: 1, width: 32 });
    for (let codepoint = 65; codepoint < 90; codepoint++) getGlyphAtlasEntry(atlas, codepoint);
    expect(messages()).toContain('working set does not fit');
    // The message must name the consumer-visible consequence, not only the cost: a repack invalidates
    // every baked rect, and a caller who reads this as "slow" will not go looking for stale text.
    expect(messages()).toContain('refreshBitmapTextGlyphLayout');
  });
});
