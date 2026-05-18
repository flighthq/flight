import type { Timeline } from '@flighthq/types';

import { createTimeline } from './createTimeline';

describe('createTimeline', () => {
  let timeline: Timeline;

  beforeEach(() => {
    timeline = createTimeline();
  });

  it('initializes default values', () => {
    expect(timeline.frameRate).toBeNull();
    expect(timeline.scenes).not.toBeNull();
    expect(timeline.scripts).not.toBeNull();
  });

  it('allows pre-defined values', () => {
    const base = {
      frameRate: 40,
      scenes: [],
      scripts: [],
    };
    const obj = createTimeline(base);
    expect(obj.frameRate).toStrictEqual(base.frameRate);
    expect(obj.scenes).toStrictEqual(base.scenes);
    expect(obj.scripts).toStrictEqual(base.scripts);
  });
});
