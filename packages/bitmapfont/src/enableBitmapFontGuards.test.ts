import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { BitmapFontData, LogEntry } from '@flighthq/types/contract';

import { createBitmapFont } from './bitmapFont';
import { disableBitmapFontGuards, enableBitmapFontGuards } from './enableBitmapFontGuards';

let entries: LogEntry[];

beforeEach(() => {
  clearLogOnceKeys();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableBitmapFontGuards();
  setLogSink(null);
});

function messages(): string {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

function fontData(page: number, pages = 1): BitmapFontData {
  return {
    glyphs: [{ advance: 9, bearingX: 1, bearingY: 8, codepoint: 65, height: 8, page, width: 7, x: 0, y: 0 }],
    metrics: { ascent: 8, descent: 2, lineGap: 1 },
    pages: Array.from({ length: pages }, () => createTextureAtlas()),
  };
}

describe('disableBitmapFontGuards', () => {
  it('stops the warning a previously-installed guard would emit', () => {
    enableBitmapFontGuards();
    disableBitmapFontGuards();

    createBitmapFont(fontData(4));

    expect(entries).toEqual([]);
  });
});

describe('enableBitmapFontGuards', () => {
  it('warns which glyph and index are wrong, and that the font data is at fault', () => {
    // ONE test for the whole message, deliberately. logOnce suppresses a key for the life of the
    // PROCESS, so a second test asserting a second phrase would observe nothing and pass vacuously —
    // the key is a single-use observation, so every assertion about it belongs in one place.
    enableBitmapFontGuards();

    createBitmapFont(fontData(4));

    // The codepoint and the bad index, because the value of the warning is telling the reader which
    // glyph and which index to look for in the font file.
    expect(messages()).toContain('U+0041');
    expect(messages()).toContain('page 4');
    // And who is at fault: the failure renders as a garbled glyph, which reads as an atlas-packing bug.
    // Naming the real culprit is why this warning exists rather than the clamp being left silent.
    expect(messages()).toContain('font data is wrong, not the atlas');
  });

  it('stays silent for a glyph whose page exists', () => {
    // Guards the guard: every assertion above would pass just as well against a guard that fired
    // unconditionally, which would make the warning noise on every well-formed font.
    enableBitmapFontGuards();

    createBitmapFont(fontData(1, 2));

    expect(entries).toEqual([]);
  });

  it('stays silent when no guard is installed at all', () => {
    createBitmapFont(fontData(4));

    expect(entries).toEqual([]);
  });
});
