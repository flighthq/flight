import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { createSpritesheet, createSpritesheetAnimation } from '@flighthq/spritesheet/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';

import { areMovieClipGuardsEnabled, disableMovieClipGuards, enableMovieClipGuards } from './enableMovieClipGuards.ts';
import { createSpritesheetTimelineSource } from './spritesheetTimelineSource.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  try {
    run();
    return readMemoryLogEntries(sink);
  } finally {
    removeLogSink(logState, sink.sink);
  }
}

afterEach(() => {
  disableMovieClipGuards();
});

describe('areMovieClipGuardsEnabled', () => {
  it('reports whether the spritesheet adapter diagnostic is installed', () => {
    expect(areMovieClipGuardsEnabled()).toBe(false);
    enableMovieClipGuards(logState, () => 0);
    expect(areMovieClipGuardsEnabled()).toBe(true);
    disableMovieClipGuards();
    expect(areMovieClipGuardsEnabled()).toBe(false);
  });
});

describe('disableMovieClipGuards', () => {
  it('restores silent adaptation without changing the returned source', () => {
    enableMovieClipGuards(logState, () => 0);
    disableMovieClipGuards();
    const entries = captureLog(() => {
      const source = createSpritesheetTimelineSource(
        createSpritesheet(),
        createSpritesheetAnimation({ frames: [0], repeatCount: 3 }),
      );
      expect(source.totalFrames).toBe(1);
    });

    expect(entries).toHaveLength(0);
  });
});

describe('enableMovieClipGuards', () => {
  it('WARNS once with the authored repeat and variable-timing loss', () => {
    enableMovieClipGuards(logState, () => 0);
    const entries = captureLog(() => {
      const sheet = createSpritesheet();
      const animation = createSpritesheetAnimation({
        frameDurations: [50, 150],
        frames: [0, 1],
        repeatCount: 2,
      });
      createSpritesheetTimelineSource(sheet, animation);
      createSpritesheetTimelineSource(sheet, animation);
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe('movieclip');
    expect(entries[0].data).toMatchObject({
      repeatCount: 2,
      unsupportedFields: ['frameDurations', 'repeatCount'],
    });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('explainSpritesheetTimelineSource');
  });
});

function readMemoryLogEntries(handle: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, handle);
  return entries;
}
