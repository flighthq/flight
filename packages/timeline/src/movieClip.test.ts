import { createMovieClip } from '@flighthq/scenegraph-display';

import {
  getMovieClipCurrentFrame,
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
