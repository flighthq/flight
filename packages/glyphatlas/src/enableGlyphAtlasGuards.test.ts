import type { LogState } from '@flighthq/log/contract';
import { clearLogOnceKeys, createLogState, getMemoryLogSinkEntries, setLogSink } from '@flighthq/log/contract';
import type { HostGlyphRasterizerCapability, LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { disableGlyphAtlasGuards, enableGlyphAtlasGuards } from './enableGlyphAtlasGuards.ts';
import { createGlyphAtlas } from './glyphAtlas.ts';
import { getGlyphAtlasEntry } from './glyphAtlasEntry.ts';

let entries: LogEntry[];

function clock(): number {
  return 0;
}

function readLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

beforeEach(() => {
  logState = createLogState();
  clearLogOnceKeys(logState);
  entries = [];
  setLogSink(logState, (entry) => entries.push(entry));
});

afterEach(() => {
  disableGlyphAtlasGuards();
  setLogSink(logState, null);
});

function messages(): string {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

function backendProducing(width: number, height: number): HostGlyphRasterizerCapability {
  return {
    rasterize: () => ({
      advance: width,
      bearingX: 0,
      bearingY: 0,
      height,
      pixels: new Uint8Array(width * height * 4),
      width,
    }),
  };
}

describe('disableGlyphAtlasGuards', () => {
  it('stops the guard reporting later lookups', () => {
    enableGlyphAtlasGuards(logState, clock);
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
    enableGlyphAtlasGuards(logState, clock);
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
    enableGlyphAtlasGuards(logState, clock);
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
    enableGlyphAtlasGuards(logState, clock);
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
    enableGlyphAtlasGuards(logState, clock);
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
    enableGlyphAtlasGuards(logState, clock);
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

let logState: LogState = createLogState();
