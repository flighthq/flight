import type { MovieClip, Timeline } from '@flighthq/types';
import { MovieClipKind } from '@flighthq/types';

import {
  addMovieClipFrameScript,
  createMovieClip,
  createMovieClipData,
  createMovieClipRuntime,
  disposeMovieClipSignals,
  enableMovieClipSignals,
  getMovieClipCurrentFrame,
  getMovieClipCurrentLabel,
  getMovieClipFrameScript,
  getMovieClipRuntime,
  getMovieClipSignals,
  getMovieClipTotalFrames,
  gotoAndPlayMovieClip,
  gotoAndStopMovieClip,
  isMovieClipPlaying,
  nextFrameMovieClip,
  playMovieClip,
  prevFrameMovieClip,
  removeMovieClipFrameScript,
  setMovieClipSource,
  stopMovieClip,
  updateMovieClip,
} from './movieClip';
import { createTimeline, createTimelineSource, playTimeline } from './timeline';

describe('addMovieClipFrameScript', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => addMovieClipFrameScript(clip, 1, () => {})).not.toThrow();
  });

  it('attaches a script that fires on frame entry', () => {
    const fired: number[] = [];
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({
      source: createTimelineSource({ totalFrames: 3, frameRate: null }),
      target: clip,
    });
    addMovieClipFrameScript(clip, 2, (_t, f) => fired.push(f));
    playMovieClip(clip);
    updateMovieClip(clip, 0); // frame 1
    updateMovieClip(clip, 0); // frame 2 — script fires
    expect(fired).toEqual([2]);
  });
});

describe('createMovieClip', () => {
  let movieClip: MovieClip;

  beforeEach(() => {
    movieClip = createMovieClip();
  });

  it('initializes default values', () => {
    expect(movieClip.data.timeline).toBeNull();
    expect(movieClip.kind).toStrictEqual(MovieClipKind);
  });

  it('allows pre-defined values', () => {
    const base = { data: { timeline: {} as Timeline } };
    const obj = createMovieClip(base);
    expect(obj.data.timeline).toStrictEqual(base.data.timeline);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createMovieClip(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createMovieClipData', () => {
  it('returns default values', () => {
    expect(createMovieClipData().timeline).toBeNull();
  });

  it('allows pre-defined values', () => {
    const timeline = {} as Timeline;
    expect(createMovieClipData({ timeline }).timeline).toBe(timeline);
  });
});

describe('createMovieClipRuntime', () => {
  it('returns a non-null runtime with movieClipSignals null', () => {
    const runtime = createMovieClipRuntime();
    expect(runtime).not.toBeNull();
    expect(runtime.movieClipSignals).toBeNull();
  });
});

describe('disposeMovieClipSignals', () => {
  it('clears movieClipSignals to null on the runtime', () => {
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 3 }));
    enableMovieClipSignals(clip);
    expect(getMovieClipSignals(clip)).not.toBeNull();
    disposeMovieClipSignals(clip);
    expect(getMovieClipSignals(clip)).toBeNull();
  });

  it('clears the underlying timeline signals', () => {
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 3 }));
    enableMovieClipSignals(clip);
    expect(clip.data.timeline!.signals).not.toBeNull();
    disposeMovieClipSignals(clip);
    expect(clip.data.timeline!.signals).toBeNull();
  });

  it('is idempotent — no-op when signals are already null', () => {
    const clip = createMovieClip();
    expect(() => disposeMovieClipSignals(clip)).not.toThrow();
  });

  it('allows enableMovieClipSignals to re-arm after dispose', () => {
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 3 }));
    const first = enableMovieClipSignals(clip);
    disposeMovieClipSignals(clip);
    const second = enableMovieClipSignals(clip);
    expect(second).not.toBe(first);
    expect(getMovieClipSignals(clip)).toBe(second);
  });
});

describe('enableMovieClipSignals', () => {
  it('returns a signals group with all lifecycle signals defined', () => {
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 3 }));
    const signals = enableMovieClipSignals(clip);
    expect(signals.onEnterFrame).toBeDefined();
    expect(signals.onExitFrame).toBeDefined();
    expect(signals.onFrameConstructed).toBeDefined();
    expect(signals.onComplete).toBeDefined();
    expect(signals.onLoop).toBeDefined();
  });

  it('is idempotent — returns the same object on subsequent calls', () => {
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 3 }));
    expect(enableMovieClipSignals(clip)).toBe(enableMovieClipSignals(clip));
  });

  it('works before setMovieClipSource is called', () => {
    const clip = createMovieClip();
    expect(() => enableMovieClipSignals(clip)).not.toThrow();
    expect(enableMovieClipSignals(clip)).not.toBeNull();
  });

  it('emits onEnterFrame when the frame changes', () => {
    const frames: number[] = [];
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 3, frameRate: null }));
    const signals = enableMovieClipSignals(clip);
    signals.onEnterFrame.emit = (event) => frames.push(event.frame);
    playMovieClip(clip);
    updateMovieClip(clip, 0); // frame 1
    updateMovieClip(clip, 0); // frame 2
    expect(frames).toContain(2);
  });
});

describe('getMovieClipCurrentFrame', () => {
  it('returns 1 when timeline is null', () => {
    const clip = createMovieClip();
    expect(getMovieClipCurrentFrame(clip)).toBe(1);
  });

  it('returns the timeline currentFrame', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 5 }), currentFrame: 3 });
    expect(getMovieClipCurrentFrame(clip)).toBe(3);
  });
});

describe('getMovieClipCurrentLabel', () => {
  it('returns null when timeline is null', () => {
    const clip = createMovieClip();
    expect(getMovieClipCurrentLabel(clip)).toBeNull();
  });

  it('returns the label at the current frame', () => {
    const clip = createMovieClip();
    setMovieClipSource(
      clip,
      createTimelineSource({
        totalFrames: 5,
        labels: [
          { name: 'idle', frame: 1 },
          { name: 'run', frame: 3 },
        ],
      }),
    );
    gotoAndStopMovieClip(clip, 3);
    expect(getMovieClipCurrentLabel(clip)?.name).toBe('run');
  });
});

describe('getMovieClipFrameScript', () => {
  it('returns null when timeline is null', () => {
    const clip = createMovieClip();
    expect(getMovieClipFrameScript(clip, 1)).toBeNull();
  });

  it('returns null when no script is attached', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 3 }) });
    expect(getMovieClipFrameScript(clip, 1)).toBeNull();
  });

  it('returns the script after addMovieClipFrameScript', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 3 }) });
    const fn = () => {};
    addMovieClipFrameScript(clip, 2, fn);
    expect(getMovieClipFrameScript(clip, 2)).toBe(fn);
  });
});

describe('getMovieClipRuntime', () => {
  it('returns the runtime for a MovieClip', () => {
    expect(getMovieClipRuntime(createMovieClip())).not.toBeNull();
  });
});

describe('getMovieClipSignals', () => {
  it('returns null before enableMovieClipSignals is called', () => {
    const clip = createMovieClip();
    expect(getMovieClipSignals(clip)).toBeNull();
  });

  it('returns the signals group after enableMovieClipSignals', () => {
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 3 }));
    const signals = enableMovieClipSignals(clip);
    expect(getMovieClipSignals(clip)).toBe(signals);
  });
});

describe('getMovieClipTotalFrames', () => {
  it('returns 1 when timeline is null', () => {
    const clip = createMovieClip();
    expect(getMovieClipTotalFrames(clip)).toBe(1);
  });

  it('returns the timeline totalFrames', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 10 }) });
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
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 5 }) });
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
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 5 }) });
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
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 3 }) });
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
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 5 }), currentFrame: 2 });
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
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 3 }) });
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
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 5 }), currentFrame: 3 });
    prevFrameMovieClip(clip);
    expect(clip.data.timeline.currentFrame).toBe(2);
  });
});

describe('removeMovieClipFrameScript', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => removeMovieClipFrameScript(clip, 1)).not.toThrow();
  });

  it('removes the script so it no longer fires', () => {
    const fired: number[] = [];
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({
      source: createTimelineSource({ totalFrames: 3, frameRate: null }),
      target: clip,
    });
    addMovieClipFrameScript(clip, 2, (_t, f) => fired.push(f));
    removeMovieClipFrameScript(clip, 2);
    playMovieClip(clip);
    updateMovieClip(clip, 0); // frame 1
    updateMovieClip(clip, 0); // frame 2 — script should not fire
    expect(fired).toEqual([]);
  });
});

describe('setMovieClipSource', () => {
  it('binds a source, targets the clip, and realizes the initial frame', () => {
    const frames: number[] = [];
    const clip = createMovieClip();
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 4, constructFrame: (_t, f) => frames.push(f) }));
    expect(getMovieClipTotalFrames(clip)).toBe(4);
    expect(clip.data.timeline?.target).toBe(clip);
    expect(frames).toEqual([1]);
  });

  it('reuses an existing timeline on the clip', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ currentFrame: 2 });
    const existing = clip.data.timeline;
    setMovieClipSource(clip, createTimelineSource({ totalFrames: 5 }));
    expect(clip.data.timeline).toBe(existing);
    expect(clip.data.timeline?.source?.totalFrames).toBe(5);
  });
});

describe('stopMovieClip', () => {
  it('does nothing when timeline is null', () => {
    const clip = createMovieClip();
    expect(() => stopMovieClip(clip)).not.toThrow();
  });

  it('stops a playing timeline', () => {
    const clip = createMovieClip();
    clip.data.timeline = createTimeline({ source: createTimelineSource({ totalFrames: 3 }) });
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
      source: createTimelineSource({ totalFrames: 3, frameRate: null, constructFrame: (_t, f) => frames.push(f) }),
      target: clip,
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
      source: createTimelineSource({ totalFrames: 3, constructFrame: (_t, f) => frames.push(f) }),
      target: clip,
    });
    updateMovieClip(clip, 0);
    expect(frames).toEqual([1]);
  });
});
