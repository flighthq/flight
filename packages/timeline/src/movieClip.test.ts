import { createMovieClip } from '@flighthq/displayobject';

import {
  createMovieClipSignals,
  getMovieClipCurrentFrame,
  getMovieClipSignals,
  getMovieClipTotalFrames,
  gotoAndPlayMovieClip,
  gotoAndStopMovieClip,
  isMovieClipPlaying,
  nextFrameMovieClip,
  playMovieClip,
  prevFrameMovieClip,
  stopMovieClip,
  updateMovieClip,
} from './movieClip';
import { createTimeline, playTimeline } from './timeline';

describe('createMovieClipSignals', () => {
  it('returns all movie clip signals', () => {
    const signals = createMovieClipSignals();
    expect(signals.onEnterFrame).toBeDefined();
    expect(signals.onExitFrame).toBeDefined();
    expect(signals.onFrameConstructed).toBeDefined();
  });

  it('returns a new object each call', () => {
    expect(createMovieClipSignals()).not.toBe(createMovieClipSignals());
  });
});

describe('getMovieClipCurrentFrame', () => {
  it('returns 1 when timeline is null', () => {
    const clip = createMovieClip();
    expect(getMovieClipCurrentFrame(clip)).toBe(1);
  });

  it('returns the timeline currentFrame', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 5, currentFrame: 3 });
    expect(getMovieClipCurrentFrame(clip)).toBe(3);
  });
});

describe('getMovieClipSignals', () => {
  it('lazily creates movie clip signals on the clip', () => {
    const clip = createMovieClip();
    const signals = getMovieClipSignals(clip);
    expect(signals.onEnterFrame).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const clip = createMovieClip();
    expect(getMovieClipSignals(clip)).toBe(getMovieClipSignals(clip));
  });
});

describe('getMovieClipTotalFrames', () => {
  it('returns 1 when timeline is null', () => {
    const clip = createMovieClip();
    expect(getMovieClipTotalFrames(clip)).toBe(1);
  });

  it('returns the timeline totalFrames', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 10 });
    expect(getMovieClipTotalFrames(clip)).toBe(10);
  });
});

describe('gotoAndPlayMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => gotoAndPlayMovieClip(clip, 2)).not.toThrow();
  });

  it('seeks to the given frame and starts playing', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 5 });
    gotoAndPlayMovieClip(clip, 3);
    expect(clip.data.timeline.currentFrame).toBe(3);
    expect(clip.data.timeline.isPlaying).toBe(true);
  });
});

describe('gotoAndStopMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => gotoAndStopMovieClip(clip, 2)).not.toThrow();
  });

  it('seeks to the given frame and stops', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 5 });
    playMovieClip(clip);
    gotoAndStopMovieClip(clip, 2);
    expect(clip.data.timeline.currentFrame).toBe(2);
    expect(clip.data.timeline.isPlaying).toBe(false);
  });
});

describe('isMovieClipPlaying', () => {
  it('returns false when timeline is null', () => {
    const clip = createMovieClip();
    expect(isMovieClipPlaying(clip)).toBe(false);
  });

  it('returns true when the timeline is playing', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 3 });
    playTimeline(clip.data.timeline);
    expect(isMovieClipPlaying(clip)).toBe(true);
  });
});

describe('nextFrameMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => nextFrameMovieClip(clip)).not.toThrow();
  });

  it('advances currentFrame by one', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 5, currentFrame: 2 });
    nextFrameMovieClip(clip);
    expect(clip.data.timeline.currentFrame).toBe(3);
  });
});

describe('playMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => playMovieClip(clip)).not.toThrow();
  });

  it('starts the timeline playing', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 3 });
    playMovieClip(clip);
    expect(clip.data.timeline.isPlaying).toBe(true);
  });
});

describe('prevFrameMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => prevFrameMovieClip(clip)).not.toThrow();
  });

  it('moves currentFrame back by one', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 5, currentFrame: 3 });
    prevFrameMovieClip(clip);
    expect(clip.data.timeline.currentFrame).toBe(2);
  });
});

describe('stopMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => stopMovieClip(clip)).not.toThrow();
  });

  it('stops a playing timeline', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ totalFrames: 3 });
    playMovieClip(clip);
    stopMovieClip(clip);
    expect(clip.data.timeline.isPlaying).toBe(false);
  });
});

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
      constructFrame: (f) => frames.push(f),
    });
    playTimeline(clip.data.timeline);
    updateMovieClip(clip, 16);
    updateMovieClip(clip, 16);
    expect(frames).toEqual([1, 2]);
  });

  it('fires constructFrame for frame 1 on first update even when stopped', () => {
    const frames: number[] = [];
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({
      totalFrames: 3,
      constructFrame: (f) => frames.push(f),
    });
    updateMovieClip(clip, 0);
    expect(frames).toEqual([1]);
  });
});
