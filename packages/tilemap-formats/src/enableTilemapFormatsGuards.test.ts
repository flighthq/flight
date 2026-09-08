import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { disableTilemapFormatsGuards, enableTilemapFormatsGuards } from './enableTilemapFormatsGuards';
import { decodeTiledBase64Layer } from './tiledLayerData';

afterEach(() => disableTilemapFormatsGuards());

// Two GIDs, deflate-compressed in name only — the guard fires before any real inflate would run, and
// the failing case needs a seam that returns null rather than real compressed bytes.
const payload = 'AQAAAAIAAAA=';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

describe('disableTilemapFormatsGuards', () => {
  it('uninstalls the guard, restoring the silent parse', () => {
    const entries = captureLog(() => {
      enableTilemapFormatsGuards();
      disableTilemapFormatsGuards();
      decodeTiledBase64Layer(payload, 'zlib');
    });
    expect(entries).toEqual([]);
  });
});

describe('enableTilemapFormatsGuards', () => {
  it('WARNS that a compressed layer had no inflate seam, naming the option that fixes it', () => {
    const entries = captureLog(() => {
      enableTilemapFormatsGuards();
      decodeTiledBase64Layer(payload, 'zlib');
    });
    expect(entries).toHaveLength(1);
    // The warning has to name the fixing call, or a reader knows only that something was dropped.
    expect(messageOf(entries[0])).toContain('options.inflate');
    expect(messageOf(entries[0])).toContain('zlib');
  });

  it('WARNS DIFFERENTLY when the supplied seam fails, because the fix is the opposite one', () => {
    const entries = captureLog(() => {
      enableTilemapFormatsGuards();
      decodeTiledBase64Layer(payload, 'gzip', () => null);
    });
    expect(entries).toHaveLength(1);
    // A caller who DID wire a seam must not be told to wire one.
    expect(messageOf(entries[0])).not.toContain('options.inflate');
    expect(messageOf(entries[0])).toContain('gzip');
  });

  it('stays SILENT on an uncompressed layer and on a seam that succeeds', () => {
    const entries = captureLog(() => {
      enableTilemapFormatsGuards();
      decodeTiledBase64Layer(payload, null);
      decodeTiledBase64Layer(payload, 'zlib', (bytes) => bytes);
    });
    expect(entries).toEqual([]);
  });

  it('stays SILENT without the guard — the production default', () => {
    const entries = captureLog(() => decodeTiledBase64Layer(payload, 'zlib'));
    expect(entries).toEqual([]);
  });
});
