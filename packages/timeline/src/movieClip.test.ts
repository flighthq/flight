import { createMovieClip } from '@flighthq/scenegraph-display';

import { updateMovieClip } from './movieClip';
import { createTimeline, playTimeline } from './timeline';

describe('updateMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => updateMovieClip(clip, 16)).not.toThrow();
  });

  it('advances the timeline when playing', () => {
    const frames: number[] = [];
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({
      totalFrames: 3,
      frameRate: null,
      onEnterFrame: (f) => frames.push(f),
    });
    playTimeline(clip.data.timeline);
    updateMovieClip(clip, 16);
    updateMovieClip(clip, 16);
    expect(frames).toEqual([1, 2]);
  });

  it('fires onEnterFrame for frame 1 on first update even when stopped', () => {
    const frames: number[] = [];
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({
      totalFrames: 3,
      onEnterFrame: (f) => frames.push(f),
    });
    updateMovieClip(clip, 0);
    expect(frames).toEqual([1]);
  });
});
