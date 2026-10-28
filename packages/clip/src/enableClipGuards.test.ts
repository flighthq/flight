import type { LogState } from '@flighthq/log/contract';
import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  acquireClipRegion,
  clipRegionContainsPoint,
  createClipRegionFromContours,
  releaseClipRegion,
} from './clipRegion.ts';
import { disableClipGuards, enableClipGuards } from './enableClipGuards.ts';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  try {
    run();
    return readLogEntries(sink);
  } finally {
    removeLogSink(logState, sink.sink);
  }
}

function clock(): number {
  return 0;
}

// A double release leaves the same region pooled twice. Acquiring both copies restores a clean pool, so
// the next test's acquire/release pairs are not handed one object twice.
function drainDoubleReleasedRegion(): void {
  acquireClipRegion();
  acquireClipRegion();
}

function readLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

beforeEach(() => {
  logState = createLogState();
});

describe('disableClipGuards', () => {
  it('uninstalls the guard, so a double release goes back to being silent', () => {
    const entries = captureLog(() => {
      enableClipGuards(logState, clock);
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
      enableClipGuards(logState, clock);
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
      enableClipGuards(logState, clock);
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
      enableClipGuards(logState, clock);
      try {
        const region = acquireClipRegion();
        releaseClipRegion(region);
        releaseClipRegion(region); // the double release being guarded
      } finally {
        disableClipGuards();
      }
    });
    drainDoubleReleasedRegion();
    expect(entries.length).toBe(1);
    // LogData is a string-or-record union, so narrow before reading the field.
    const data = entries[0].data;
    expect(typeof data === 'string' ? data : String(data.message)).toContain('released twice');
  });

  it('stays SILENT for correctly paired acquire/release, and without the guard at all', () => {
    const paired = captureLog(() => {
      enableClipGuards(logState, clock);
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
    drainDoubleReleasedRegion();
    expect(unguarded.length).toBe(0);
  });
});

let logState: LogState = createLogState();
