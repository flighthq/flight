import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  DisplayObject,
  FrameScript,
  Timeline,
  TimelineFrameEvent,
  TimelineLabel,
  TimelineSignals,
  TimelineSource,
} from '@flighthq/types';

export function addTimelineFrameScript(timeline: Timeline, frame: number | string, script: FrameScript): void {
  const resolved = resolveFrame(timeline, frame);
  (timeline.frameScripts ??= new Map()).set(resolved, script);
}

export function createTimeline(obj?: Partial<Timeline>): Timeline {
  return {
    source: obj?.source ?? null,
    target: obj?.target ?? null,
    currentFrame: obj?.currentFrame ?? 1,
    frameScripts: obj?.frameScripts ?? null,
    isPlaying: obj?.isPlaying ?? false,
    lastFrameUpdate: -1,
    playMode: obj?.playMode ?? 'loop',
    signals: obj?.signals ?? null,
    timeElapsed: 0,
  };
}

// Native authoring entry: wraps an explicit per-frame `constructFrame` plus structure into a
// TimelineSource. This is the timeline's own "format" — the analogue of createPath/appendPath in
// @flighthq/path — so a Timeline is usable on its own; external formats (spritesheet, importers)
// produce a TimelineSource the same way.
export function createTimelineSource(obj: {
  totalFrames?: number;
  frameRate?: number | null;
  labels?: readonly TimelineLabel[];
  constructFrame?: (target: DisplayObject, frame: number) => void;
}): TimelineSource {
  return {
    totalFrames: obj.totalFrames ?? 1,
    frameRate: obj.frameRate ?? null,
    labels: obj.labels ?? EMPTY_LABELS,
    constructFrame: obj.constructFrame ?? noopConstructFrame,
  };
}

export function disposeTimelineSignals(timeline: Timeline): void {
  timeline.signals = null;
}

// Allocates a TimelineSignals group on the timeline and arms per-frame signal emission in
// updateTimeline and seekTimeline. Idempotent — returns the same group on subsequent calls.
export function enableTimelineSignals(timeline: Timeline): TimelineSignals {
  return (timeline.signals ??= createTimelineSignals());
}

export function findTimelineLabel(timeline: Readonly<Timeline>, name: string): TimelineLabel | null {
  return getTimelineLabels(timeline).find((l) => l.name === name) ?? null;
}

// Returns the label whose frame range the playhead currently sits in (the last label at or before
// currentFrame), or null if no labels are defined or none precede the current frame.
export function getTimelineCurrentLabel(timeline: Readonly<Timeline>): TimelineLabel | null {
  const labels = getTimelineLabels(timeline);
  const frame = timeline.currentFrame;
  let result: TimelineLabel | null = null;
  for (const label of labels) {
    if (label.frame <= frame) {
      if (result === null || label.frame >= result.frame) result = label;
    }
  }
  return result;
}

export function getTimelineFrameScript(timeline: Readonly<Timeline>, frame: number | string): FrameScript | null {
  if (timeline.frameScripts === null) return null;
  const resolved = resolveFrame(timeline, frame);
  return timeline.frameScripts.get(resolved) ?? null;
}

export function gotoAndPlayTimeline(timeline: Timeline, frame: number | string): void {
  playTimeline(timeline);
  seekTimeline(timeline, resolveFrame(timeline, frame));
}

export function gotoAndStopTimeline(timeline: Timeline, frame: number | string): void {
  stopTimeline(timeline);
  seekTimeline(timeline, resolveFrame(timeline, frame));
}

export function nextFrameTimeline(timeline: Timeline): void {
  stopTimeline(timeline);
  seekTimeline(timeline, timeline.currentFrame + 1);
}

export function playTimeline(timeline: Timeline): void {
  if (timeline.isPlaying || getTimelineTotalFrames(timeline) < 2) return;
  timeline.isPlaying = true;
  timeline.timeElapsed = 0;
}

export function prevFrameTimeline(timeline: Timeline): void {
  stopTimeline(timeline);
  seekTimeline(timeline, timeline.currentFrame - 1);
}

export function removeTimelineFrameScript(timeline: Timeline, frame: number | string): void {
  if (timeline.frameScripts === null) return;
  const resolved = resolveFrame(timeline, frame);
  timeline.frameScripts.delete(resolved);
  if (timeline.frameScripts.size === 0) timeline.frameScripts = null;
}

export function stopTimeline(timeline: Timeline): void {
  timeline.isPlaying = false;
}

export function updateTimeline(timeline: Timeline, deltaTime: number): void {
  const frameRate = getTimelineFrameRate(timeline);
  if (timeline.isPlaying && frameRate !== null) {
    timeline.currentFrame = advanceFrame(timeline, deltaTime);
  }
  fireConstructFrame(timeline);
  if (timeline.isPlaying && frameRate === null) {
    timeline.currentFrame = advanceFrame(timeline, deltaTime);
  }
}

const EMPTY_LABELS: readonly TimelineLabel[] = [];

function noopConstructFrame(): void {}

// Frame accounting matches Flash/OpenFL: when accumulated time spans multiple frames in one update,
// the playhead jumps straight to the landing frame (currentFrame + floor(timeElapsed / frameTime)).
// Skipped intermediate frames are not visited — fireConstructFrame runs for the landing frame only, so
// their onEnterFrame/onExitFrame signals and frame scripts do not fire. This is intentional (a slow
// frame should not replay every in-between frame's scripts); a maxFrameSkip clamp or fractional-frame
// interpolation would be a separate policy decision, not part of this contract.
function advanceFrame(timeline: Timeline, deltaTime: number): number {
  const frameRate = getTimelineFrameRate(timeline);
  const totalFrames = getTimelineTotalFrames(timeline);
  if (frameRate !== null) {
    const frameTime = 1000 / frameRate;
    timeline.timeElapsed += deltaTime;
    let next = timeline.currentFrame + Math.floor(timeline.timeElapsed / frameTime);
    timeline.timeElapsed %= frameTime;
    if (next > totalFrames) {
      if (timeline.playMode === 'once') {
        timeline.isPlaying = false;
        const completed = totalFrames;
        const signals = timeline.signals;
        if (signals !== null) emitSignal(signals.onComplete);
        return completed;
      }
      next = ((next - 1) % totalFrames) + 1;
      const signals = timeline.signals;
      if (signals !== null) emitSignal(signals.onLoop);
    }
    return next;
  }
  const next = timeline.currentFrame + 1;
  if (next > totalFrames) {
    if (timeline.playMode === 'once') {
      timeline.isPlaying = false;
      const signals = timeline.signals;
      if (signals !== null) emitSignal(signals.onComplete);
      return totalFrames;
    }
    const signals = timeline.signals;
    if (signals !== null) emitSignal(signals.onLoop);
    return 1;
  }
  return next;
}

function createTimelineSignals(): TimelineSignals {
  return {
    onComplete: createSignal(),
    onEnterFrame: createSignal(),
    onExitFrame: createSignal(),
    onFrameConstructed: createSignal(),
    onLoop: createSignal(),
  };
}

// Constructs and fires exactly one frame — the current playhead frame — regardless of how far it moved
// since the last update. When advanceFrame jumps across skipped frames, only the landing frame is
// constructed here; the intervening frames' scripts and enter/exit signals are not run (landing-frame-only,
// matching Flash). frameEvent.previousFrame carries the prior landing frame, which may be many frames back.
function fireConstructFrame(timeline: Timeline): void {
  const previous = timeline.lastFrameUpdate;
  const current = timeline.currentFrame;
  if (current === previous) return;

  const signals = timeline.signals;
  const target = timeline.target;
  const frameEvent: TimelineFrameEvent = { frame: current, previousFrame: previous };

  if (signals !== null) emitSignal(signals.onExitFrame, frameEvent);
  timeline.lastFrameUpdate = current;
  if (signals !== null) emitSignal(signals.onEnterFrame, frameEvent);
  if (target !== null) timeline.source?.constructFrame(target, current);
  if (timeline.frameScripts !== null) {
    const script = timeline.frameScripts.get(current);
    if (script !== undefined && target !== null) script(target, current);
  }
  if (signals !== null) emitSignal(signals.onFrameConstructed, frameEvent);
}

function getTimelineFrameRate(timeline: Readonly<Timeline>): number | null {
  return timeline.source?.frameRate ?? null;
}

function getTimelineLabels(timeline: Readonly<Timeline>): readonly TimelineLabel[] {
  return timeline.source?.labels ?? EMPTY_LABELS;
}

function getTimelineTotalFrames(timeline: Readonly<Timeline>): number {
  return timeline.source?.totalFrames ?? 1;
}

function resolveFrame(timeline: Readonly<Timeline>, frame: number | string): number {
  if (typeof frame === 'number') return frame;
  const label = findTimelineLabel(timeline, frame);
  if (!label) throw new Error(`Frame label "${frame}" not found`);
  return label.frame;
}

function seekTimeline(timeline: Timeline, frame: number): void {
  timeline.currentFrame = Math.max(1, Math.min(frame, getTimelineTotalFrames(timeline)));
  timeline.lastFrameUpdate = -1;
  fireConstructFrame(timeline);
}
