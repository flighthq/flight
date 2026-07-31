import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { acquireClipRegion, releaseClipRegion } from './clipRegion';
import { disableClipGuards, enableClipGuards } from './enableClipGuards';

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

describe('disableClipGuards', () => {
  it('uninstalls the guard, so a double release goes back to being silent', () => {
    const entries = captureLog(() => {
      enableClipGuards();
      disableClipGuards();
      const region = acquireClipRegion();
      releaseClipRegion(region);
      releaseClipRegion(region); // still corrupts the pool; simply no longer reported
    });
    expect(entries.length).toBe(0);
  });
});

describe('enableClipGuards', () => {
  it('WARNS when a region is released twice, which would otherwise alias silently', () => {
    const entries = captureLog(() => {
      enableClipGuards();
      try {
        const region = acquireClipRegion();
        releaseClipRegion(region);
        releaseClipRegion(region); // the double release being guarded
      } finally {
        disableClipGuards();
      }
    });
    expect(entries.length).toBe(1);
    // LogData is a string-or-record union, so narrow before reading the field.
    const data = entries[0].data;
    expect(typeof data === 'string' ? data : String(data.message)).toContain('released twice');
  });

  it('stays SILENT for correctly paired acquire/release, and without the guard at all', () => {
    const paired = captureLog(() => {
      enableClipGuards();
      try {
        const a = acquireClipRegion();
        const b = acquireClipRegion();
        releaseClipRegion(a);
        releaseClipRegion(b);
        // Re-acquiring and releasing again is legitimate and must not warn.
        releaseClipRegion(acquireClipRegion());
      } finally {
        disableClipGuards();
      }
    });
    expect(paired.length).toBe(0);

    // Production default: the double release still corrupts the pool, but nothing is logged.
    const unguarded = captureLog(() => {
      const region = acquireClipRegion();
      releaseClipRegion(region);
      releaseClipRegion(region);
    });
    expect(unguarded.length).toBe(0);
  });
});
