import type { DisplayObject, Timeline } from '@flighthq/types';

import {
  addTimelineFrameScript,
  createTimeline,
  createTimelineSource,
  disposeTimelineSignals,
  enableTimelineSignals,
  findTimelineLabel,
  getTimelineCurrentLabel,
  getTimelineFrameScript,
  gotoAndPlayTimeline,
  gotoAndStopTimeline,
  nextFrameTimeline,
  playTimeline,
  prevFrameTimeline,
  removeTimelineFrameScript,
  stopTimeline,
  updateTimeline,
} from './timeline';

interface MakeOptions {
  totalFrames?: number;
  frameRate?: number | null;
  labels?: { name: string; frame: number }[];
  constructFrame?: (frame: number) => void;
  currentFrame?: number;
  isPlaying?: boolean;
}

// Builds a timeline backed by a source (totalFrames/frameRate/labels/constructFrame) with a mock target
// so constructFrame fires. Test callbacks take just the frame; the source adapts to (target, frame).
function make(o: MakeOptions = {}): Timeline {
  return createTimeline({
    source: createTimelineSource({
      totalFrames: o.totalFrames ?? 4,
      frameRate: o.frameRate === undefined ? 10 : o.frameRate,
      labels: o.labels,
      constructFrame: o.constructFrame ? (_target, frame) => o.constructFrame!(frame) : undefined,
    }),
    target: {} as DisplayObject,
    currentFrame: o.currentFrame,
    isPlaying: o.isPlaying,
  });
}

describe('addTimelineFrameScript', () => {
  it('attaches a script that fires once on frame entry', () => {
    const fired: number[] = [];
    const t = make({ frameRate: null });
    addTimelineFrameScript(t, 2, (_target, f) => fired.push(f));
    playTimeline(t);
    updateTimeline(t, 0); // frame 1 — no script
    updateTimeline(t, 0); // frame 2 — script fires
    expect(fired).toEqual([2]);
  });

  it('does not re-fire the script on repeated updates to the same stopped frame', () => {
    const fired: number[] = [];
    const t = make({ frameRate: null });
    addTimelineFrameScript(t, 2, (_target, f) => fired.push(f));
    playTimeline(t);
    updateTimeline(t, 0); // frame 1
    updateTimeline(t, 0); // frame 2 — fires once
    stopTimeline(t);
    updateTimeline(t, 0); // still frame 2, stopped — no re-fire
    updateTimeline(t, 0); // still frame 2, stopped — no re-fire
    expect(fired).toEqual([2]);
  });

  it('accepts a label string as the frame argument', () => {
    const fired: number[] = [];
    const t = make({ frameRate: null, labels: [{ name: 'run', frame: 3 }] });
    addTimelineFrameScript(t, 'run', (_target, f) => fired.push(f));
    gotoAndStopTimeline(t, 3);
    expect(fired).toEqual([3]);
  });
});

describe('createTimeline', () => {
  it('starts at frame 1, stopped, lastFrameUpdate -1', () => {
    const t = make();
    expect(t.currentFrame).toBe(1);
    expect(t.isPlaying).toBe(false);
    expect(t.lastFrameUpdate).toBe(-1);
  });

  it('defaults playMode to loop', () => {
    const t = make();
    expect(t.playMode).toBe('loop');
  });

  it('defaults frameScripts to null', () => {
    const t = make();
    expect(t.frameScripts).toBeNull();
  });

  it('defaults signals to null', () => {
    const t = make();
    expect(t.signals).toBeNull();
  });

  it('applies overrides', () => {
    const t = make({ currentFrame: 3, frameRate: 24 });
    expect(t.currentFrame).toBe(3);
    expect(t.source?.frameRate).toBe(24);
  });
});

describe('createTimelineSource', () => {
  it('builds a source with defaults', () => {
    const s = createTimelineSource({});
    expect(s.totalFrames).toBe(1);
    expect(s.frameRate).toBeNull();
    expect(s.labels).toEqual([]);
  });

  it('carries provided fields and invokes constructFrame with (target, frame)', () => {
    const seen: number[] = [];
    const s = createTimelineSource({
      totalFrames: 3,
      frameRate: 12,
      labels: [{ name: 'a', frame: 2 }],
      constructFrame: (_target, frame) => seen.push(frame),
    });
    expect(s.totalFrames).toBe(3);
    expect(s.frameRate).toBe(12);
    expect(s.labels).toEqual([{ name: 'a', frame: 2 }]);
    s.constructFrame({} as unknown as DisplayObject, 2);
    expect(seen).toEqual([2]);
  });
});

describe('disposeTimelineSignals', () => {
  it('clears timeline.signals to null', () => {
    const t = make();
    enableTimelineSignals(t);
    expect(t.signals).not.toBeNull();
    disposeTimelineSignals(t);
    expect(t.signals).toBeNull();
  });

  it('is idempotent — no-op when signals are already null', () => {
    const t = make();
    expect(() => disposeTimelineSignals(t)).not.toThrow();
    expect(t.signals).toBeNull();
  });

  it('allows enableTimelineSignals to re-arm after dispose', () => {
    const t = make();
    const first = enableTimelineSignals(t);
    disposeTimelineSignals(t);
    const second = enableTimelineSignals(t);
    expect(second).not.toBe(first);
    expect(t.signals).toBe(second);
  });
});

describe('enableTimelineSignals', () => {
  it('returns a TimelineSignals group with all lifecycle signals defined', () => {
    const t = make();
    const signals = enableTimelineSignals(t);
    expect(signals.onEnterFrame).toBeDefined();
    expect(signals.onExitFrame).toBeDefined();
    expect(signals.onFrameConstructed).toBeDefined();
    expect(signals.onComplete).toBeDefined();
    expect(signals.onLoop).toBeDefined();
  });

  it('is idempotent — returns the same group on subsequent calls', () => {
    const t = make();
    expect(enableTimelineSignals(t)).toBe(enableTimelineSignals(t));
  });

  it('stores the signals on timeline.signals', () => {
    const t = make();
    const signals = enableTimelineSignals(t);
    expect(t.signals).toBe(signals);
  });

  it('emits onEnterFrame with correct frame and previousFrame when frame changes', () => {
    const events: { frame: number; previousFrame: number }[] = [];
    const t = make({ frameRate: null });
    const signals = enableTimelineSignals(t);
    signals.onEnterFrame.emit = (event) => events.push({ frame: event.frame, previousFrame: event.previousFrame });
    playTimeline(t);
    updateTimeline(t, 0); // frame 1 (was -1 sentinel)
    updateTimeline(t, 0); // frame 2
    expect(events[0].frame).toBe(1);
    expect(events[1].frame).toBe(2);
    expect(events[1].previousFrame).toBe(1);
  });

  it('emits onExitFrame before frame changes', () => {
    const order: string[] = [];
    const t = make({ frameRate: null });
    const signals = enableTimelineSignals(t);
    signals.onExitFrame.emit = () => order.push('exit');
    signals.onEnterFrame.emit = () => order.push('enter');
    signals.onFrameConstructed.emit = () => order.push('constructed');
    playTimeline(t);
    updateTimeline(t, 0); // first frame entry
    expect(order).toEqual(['exit', 'enter', 'constructed']);
  });

  it('emits onLoop when the timeline wraps in loop mode', () => {
    let looped = false;
    const t = make({ totalFrames: 2, frameRate: null });
    const signals = enableTimelineSignals(t);
    signals.onLoop.emit = () => {
      looped = true;
    };
    playTimeline(t);
    updateTimeline(t, 0); // frame 1
    updateTimeline(t, 0); // frame 2
    updateTimeline(t, 0); // wraps to frame 1 → onLoop
    expect(looped).toBe(true);
  });

  it('emits onComplete and stops when playMode is once and last frame is reached', () => {
    let completed = false;
    const t = make({ totalFrames: 2, frameRate: null });
    t.playMode = 'once';
    const signals = enableTimelineSignals(t);
    signals.onComplete.emit = () => {
      completed = true;
    };
    playTimeline(t);
    updateTimeline(t, 0); // frame 1
    updateTimeline(t, 0); // frame 2
    updateTimeline(t, 0); // would loop — stops, fires onComplete
    expect(completed).toBe(true);
    expect(t.isPlaying).toBe(false);
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

describe('getTimelineCurrentLabel', () => {
  it('returns null when there are no labels', () => {
    const t = make();
    expect(getTimelineCurrentLabel(t)).toBeNull();
  });

  it('returns null when no label precedes the current frame', () => {
    const t = make({ labels: [{ name: 'run', frame: 3 }], currentFrame: 1 });
    expect(getTimelineCurrentLabel(t)).toBeNull();
  });

  it('returns the label exactly at the current frame', () => {
    const t = make({ labels: [{ name: 'run', frame: 3 }], currentFrame: 3 });
    expect(getTimelineCurrentLabel(t)?.name).toBe('run');
  });

  it('returns the last label at or before the current frame', () => {
    const t = make({
      totalFrames: 6,
      labels: [
        { name: 'idle', frame: 1 },
        { name: 'run', frame: 3 },
      ],
      currentFrame: 4,
    });
    expect(getTimelineCurrentLabel(t)?.name).toBe('run');
  });
});

describe('getTimelineFrameScript', () => {
  it('returns null when no scripts are attached', () => {
    const t = make();
    expect(getTimelineFrameScript(t, 1)).toBeNull();
  });

  it('returns null for a frame with no script when others exist', () => {
    const t = make();
    addTimelineFrameScript(t, 2, () => {});
    expect(getTimelineFrameScript(t, 1)).toBeNull();
  });

  it('returns the script attached to a frame', () => {
    const t = make();
    const fn = () => {};
    addTimelineFrameScript(t, 3, fn);
    expect(getTimelineFrameScript(t, 3)).toBe(fn);
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
    const t = createTimeline({ source: createTimelineSource({ totalFrames: 1 }) });
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

describe('removeTimelineFrameScript', () => {
  it('is a no-op when no scripts are attached', () => {
    const t = make();
    expect(() => removeTimelineFrameScript(t, 2)).not.toThrow();
  });

  it('removes the script so it no longer fires', () => {
    const fired: number[] = [];
    const t = make({ frameRate: null });
    addTimelineFrameScript(t, 2, (_target, f) => fired.push(f));
    removeTimelineFrameScript(t, 2);
    playTimeline(t);
    updateTimeline(t, 0); // frame 1
    updateTimeline(t, 0); // frame 2 — script should not fire
    expect(fired).toEqual([]);
  });

  it('clears frameScripts to null when the last script is removed', () => {
    const t = make();
    addTimelineFrameScript(t, 2, () => {});
    removeTimelineFrameScript(t, 2);
    expect(t.frameScripts).toBeNull();
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

  it('wraps around to frame 1 after the last frame in loop mode', () => {
    const frames: number[] = [];
    const t = make({ totalFrames: 3, frameRate: null, constructFrame: (f) => frames.push(f) });
    playTimeline(t);
    updateTimeline(t, 0); // frame 1
    updateTimeline(t, 0); // frame 2
    updateTimeline(t, 0); // frame 3
    updateTimeline(t, 0); // wraps to frame 1
    expect(frames).toEqual([1, 2, 3, 1]);
  });

  it('stops at the last frame in once mode and does not wrap', () => {
    const frames: number[] = [];
    const t = make({ totalFrames: 3, frameRate: null, constructFrame: (f) => frames.push(f) });
    t.playMode = 'once';
    playTimeline(t);
    updateTimeline(t, 0); // frame 1
    updateTimeline(t, 0); // frame 2
    updateTimeline(t, 0); // frame 3
    updateTimeline(t, 0); // stopped — no new frame
    expect(frames).toEqual([1, 2, 3]);
    expect(t.isPlaying).toBe(false);
    expect(t.currentFrame).toBe(3);
  });

  it('can skip multiple frames in one large deltaTime', () => {
    const frames: number[] = [];
    const t = make({ totalFrames: 4, frameRate: 10, constructFrame: (f) => frames.push(f) }); // 100ms/frame
    playTimeline(t);
    updateTimeline(t, 250); // should advance 2 frames beyond current
    expect(t.currentFrame).toBe(3);
  });
});
