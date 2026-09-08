import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  acquireClipRegion,
  clipRegionContainsPoint,
  createClipRegionFromContours,
  releaseClipRegion,
} from './clipRegion';
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
    // Remove both copies left by the deliberately unguarded double release.
    acquireClipRegion();
    acquireClipRegion();
  });
});

describe('enableClipGuards', () => {
  it('reports malformed contours', () => {
    const entries = captureLog(() => {
      enableClipGuards();
      createClipRegionFromContours([[0, 0, 1]], 'nonZero');
      disableClipGuards();
    });
    expect(
      entries.some((entry) =>
        String((entry.data as { message?: unknown } | undefined)?.message ?? '').includes('odd-coordinate-count'),
      ),
    ).toBe(true);
  });

  it('reports use after release', () => {
    const entries = captureLog(() => {
      enableClipGuards();
      const region = acquireClipRegion();
      releaseClipRegion(region);
      clipRegionContainsPoint(region, 0, 0);
      acquireClipRegion();
      disableClipGuards();
    });
    expect(
      entries.some((entry) =>
        String((entry.data as { message?: unknown } | undefined)?.message ?? '').includes('released ClipRegion'),
      ),
    ).toBe(true);
  });

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
