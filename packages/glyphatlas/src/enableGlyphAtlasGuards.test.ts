import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { GlyphRasterizerBackend, LogEntry } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { disableGlyphAtlasGuards, enableGlyphAtlasGuards } from './enableGlyphAtlasGuards';
import { createGlyphAtlas } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';

let entries: LogEntry[];

beforeEach(() => {
  clearLogOnceKeys();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableGlyphAtlasGuards();
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
    getGlyphAtlasEntry(
      createGlyphAtlas({
        fontFamily: 'm',
        fontSize: 16,
        height: 64,
        rasterizerBackend: { rasterize: () => null },
        width: 64,
      }),
      65,
    );
    expect(messages()).toBe('');
  });
});

describe('enableGlyphAtlasGuards', () => {
  it('says nothing when the glyph renders', () => {
    enableGlyphAtlasGuards();
    getGlyphAtlasEntry(
      createGlyphAtlas({
        fontFamily: 'm',
        fontSize: 16,
        height: 64,
        rasterizerBackend: backendProducing(8, 8),
        width: 64,
      }),
      65,
    );
    expect(messages()).toBe('');
  });

  it('warns when the rasterizer produces nothing', () => {
    enableGlyphAtlasGuards();
    getGlyphAtlasEntry(
      createGlyphAtlas({
        fontFamily: 'm',
        fontSize: 16,
        height: 64,
        rasterizerBackend: { rasterize: () => null },
        width: 64,
      }),
      0x41,
    );
    expect(messages()).toContain('rasterizer produced nothing');
    expect(messages()).toContain('U+0041');
  });

  it('warns distinctly when the glyph is larger than the atlas', () => {
    enableGlyphAtlasGuards();
    getGlyphAtlasEntry(
      createGlyphAtlas({
        fontFamily: 'm',
        fontSize: 16,
        height: 64,
        rasterizerBackend: backendProducing(200, 8),
        width: 64,
      }),
      65,
    );
    expect(messages()).toContain('larger than the atlas');
    expect(messages()).not.toContain('rasterizer produced nothing');
  });

  it('says nothing about the first repacks an atlas needs to settle', () => {
    enableGlyphAtlasGuards();
    const atlas = createGlyphAtlas({
      fontFamily: 'm',
      fontSize: 8,
      height: 32,
      padding: 1,
      rasterizerBackend: backendProducing(8, 8),
      width: 32,
    });
    for (let codepoint = 65; codepoint < 76; codepoint++) getGlyphAtlasEntry(atlas, codepoint);
    expect(atlas.runtime.layoutVersion).toBe(2);
    expect(messages()).toBe('');
  });

  it('warns once the repacks pass the point of an atlas settling', () => {
    enableGlyphAtlasGuards();
    const atlas = createGlyphAtlas({
      fontFamily: 'm',
      fontSize: 8,
      height: 32,
      padding: 1,
      rasterizerBackend: backendProducing(8, 8),
      width: 32,
    });
    for (let codepoint = 65; codepoint < 90; codepoint++) getGlyphAtlasEntry(atlas, codepoint);
    expect(messages()).toContain('working set does not fit');
    expect(messages()).toContain('refreshBitmapTextGlyphLayout');
  });
});
