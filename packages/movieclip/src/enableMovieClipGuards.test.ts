import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createSpritesheet, createSpritesheetAnimation } from '@flighthq/spritesheet/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { areMovieClipGuardsEnabled, disableMovieClipGuards, enableMovieClipGuards } from './enableMovieClipGuards';
import { createSpritesheetTimelineSource } from './spritesheetTimelineSource';

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

afterEach(() => {
  disableMovieClipGuards();
});

describe('areMovieClipGuardsEnabled', () => {
  it('reports whether the spritesheet adapter diagnostic is installed', () => {
    expect(areMovieClipGuardsEnabled()).toBe(false);
    enableMovieClipGuards();
    expect(areMovieClipGuardsEnabled()).toBe(true);
    disableMovieClipGuards();
    expect(areMovieClipGuardsEnabled()).toBe(false);
  });
});

describe('disableMovieClipGuards', () => {
  it('restores silent adaptation without changing the returned source', () => {
    enableMovieClipGuards();
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
    enableMovieClipGuards();
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
