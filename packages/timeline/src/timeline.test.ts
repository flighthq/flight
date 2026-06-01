import type { Timeline } from '@flighthq/types';

import {
  createTimeline,
  findTimelineLabel,
  gotoAndPlayTimeline,
  gotoAndStopTimeline,
  nextFrameTimeline,
  playTimeline,
  prevFrameTimeline,
  stopTimeline,
  updateTimeline,
} from './timeline';

function make(overrides?: Partial<Timeline>): Timeline {
  return createTimeline({ totalFrames: 4, frameRate: 10, ...overrides });
}

describe('createTimeline', () => {
  it('starts at frame 1, stopped, lastFrameUpdate -1', () => {
    const t = make();
    expect(t.currentFrame).toBe(1);
    expect(t.isPlaying).toBe(false);
    expect(t.lastFrameUpdate).toBe(-1);
  });

  it('applies overrides', () => {
    const t = make({ currentFrame: 3, frameRate: 24 });
    expect(t.currentFrame).toBe(3);
    expect(t.frameRate).toBe(24);
  });
});

describe('findTimelineLabel', () => {
  it('returns the matching label', () => {
    const t = make({
      labels: [
        { name: 'idle', frame: 1 },
        { name: 'run', frame: 3 },
      ],
    });
    expect(findTimelineLabel(t, 'run')?.frame).toBe(3);
  });

  it('returns null for an unknown name', () => {
    const t = make();
    expect(findTimelineLabel(t, 'missing')).toBeNull();
  });
});

describe('gotoAndPlayTimeline', () => {
  it('seeks to frame and starts playing', () => {
    const t = make();
    gotoAndPlayTimeline(t, 3);
    expect(t.currentFrame).toBe(3);
    expect(t.isPlaying).toBe(true);
  });

  it('fires constructFrame immediately for the target frame', () => {
    const frames: number[] = [];
    const t = make({ constructFrame: (f) => frames.push(f) });
    gotoAndPlayTimeline(t, 3);
    expect(frames).toEqual([3]);
  });

  it('resolves a label name to a frame number', () => {
    const t = make({ labels: [{ name: 'run', frame: 2 }] });
    gotoAndPlayTimeline(t, 'run');
    expect(t.currentFrame).toBe(2);
    expect(t.isPlaying).toBe(true);
  });

  it('throws for an unknown label', () => {
    const t = make();
    expect(() => gotoAndPlayTimeline(t, 'missing')).toThrow();
  });
});

describe('gotoAndStopTimeline', () => {
  it('seeks to frame and stops', () => {
    const t = make();
    playTimeline(t);
    gotoAndStopTimeline(t, 2);
    expect(t.currentFrame).toBe(2);
    expect(t.isPlaying).toBe(false);
  });

  it('clamps frame to valid range', () => {
    const t = make({ totalFrames: 4 });
    gotoAndStopTimeline(t, 99);
    expect(t.currentFrame).toBe(4);
    gotoAndStopTimeline(t, 0);
    expect(t.currentFrame).toBe(1);
  });
});

describe('nextFrameTimeline', () => {
  it('advances one frame and stops', () => {
    const t = make();
    playTimeline(t);
    nextFrameTimeline(t);
    expect(t.currentFrame).toBe(2);
    expect(t.isPlaying).toBe(false);
  });

  it('clamps at the last frame', () => {
    const t = make({ totalFrames: 4 });
    gotoAndStopTimeline(t, 4);
    nextFrameTimeline(t);
    expect(t.currentFrame).toBe(4);
  });
});

describe('playTimeline', () => {
  it('sets isPlaying to true', () => {
    const t = make();
    playTimeline(t);
    expect(t.isPlaying).toBe(true);
  });

  it('does nothing when totalFrames < 2', () => {
    const t = createTimeline({ totalFrames: 1 });
    playTimeline(t);
    expect(t.isPlaying).toBe(false);
  });

  it('resets timeElapsed on play', () => {
    const t = make();
    t.timeElapsed = 999;
    playTimeline(t);
    expect(t.timeElapsed).toBe(0);
  });
});

describe('prevFrameTimeline', () => {
  it('retreats one frame and stops', () => {
    const t = make();
    gotoAndStopTimeline(t, 3);
    prevFrameTimeline(t);
    expect(t.currentFrame).toBe(2);
    expect(t.isPlaying).toBe(false);
  });

  it('clamps at frame 1', () => {
    const t = make();
    prevFrameTimeline(t);
    expect(t.currentFrame).toBe(1);
  });
});

describe('stopTimeline', () => {
  it('sets isPlaying to false', () => {
    const t = make();
    playTimeline(t);
    stopTimeline(t);
    expect(t.isPlaying).toBe(false);
  });
});

describe('updateTimeline', () => {
  it('fires constructFrame for frame 1 on first update even when stopped', () => {
    const frames: number[] = [];
    const t = make({ constructFrame: (f) => frames.push(f) });
    updateTimeline(t, 0);
    expect(frames).toEqual([1]);
  });

  it('does not double-fire constructFrame on repeated stopped updates', () => {
    const frames: number[] = [];
    const t = make({ constructFrame: (f) => frames.push(f) });
    updateTimeline(t, 0);
    updateTimeline(t, 0);
    expect(frames).toEqual([1]);
  });

  it('advances one frame per update when frameRate is null', () => {
    const frames: number[] = [];
    const t = make({ frameRate: null, constructFrame: (f) => frames.push(f) });
    playTimeline(t);
    updateTimeline(t, 0);
    updateTimeline(t, 0);
    updateTimeline(t, 0);
    expect(frames).toEqual([1, 2, 3]);
  });

  it('advances frame after enough time has elapsed for frameRate', () => {
    const frames: number[] = [];
    const t = make({ frameRate: 10, constructFrame: (f) => frames.push(f) }); // 100ms/frame
    playTimeline(t);
    updateTimeline(t, 50);
    expect(frames).toEqual([1]);
    updateTimeline(t, 50);
    expect(frames).toEqual([1, 2]);
  });

  it('wraps around to frame 1 after the last frame', () => {
    const frames: number[] = [];
    const t = make({ totalFrames: 3, frameRate: null, constructFrame: (f) => frames.push(f) });
    playTimeline(t);
    updateTimeline(t, 0); // frame 1
    updateTimeline(t, 0); // frame 2
    updateTimeline(t, 0); // frame 3
    updateTimeline(t, 0); // wraps to frame 1
    expect(frames).toEqual([1, 2, 3, 1]);
  });

  it('can skip multiple frames in one large deltaTime', () => {
    const frames: number[] = [];
    const t = make({ totalFrames: 4, frameRate: 10, constructFrame: (f) => frames.push(f) }); // 100ms/frame
    playTimeline(t);
    updateTimeline(t, 250); // should advance 2 frames beyond current
    expect(t.currentFrame).toBe(3);
  });
});
