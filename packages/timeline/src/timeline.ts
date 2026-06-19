import type { DisplayObject, Timeline, TimelineLabel, TimelineSource } from '@flighthq/types';

export function createTimeline(obj?: Partial<Timeline>): Timeline {
  return {
    source: obj?.source ?? null,
    target: obj?.target ?? null,
    currentFrame: obj?.currentFrame ?? 1,
    isPlaying: obj?.isPlaying ?? false,
    timeElapsed: 0,
    lastFrameUpdate: -1,
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

export function findTimelineLabel(timeline: Readonly<Timeline>, name: string): TimelineLabel | null {
  return getTimelineLabels(timeline).find((l) => l.name === name) ?? null;
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

function advanceFrame(timeline: Timeline, deltaTime: number): number {
  const frameRate = getTimelineFrameRate(timeline);
  const totalFrames = getTimelineTotalFrames(timeline);
  if (frameRate !== null) {
    const frameTime = 1000 / frameRate;
    timeline.timeElapsed += deltaTime;
    let next = timeline.currentFrame + Math.floor(timeline.timeElapsed / frameTime);
    timeline.timeElapsed %= frameTime;
    if (next > totalFrames) next = ((next - 1) % totalFrames) + 1;
    return next;
  }
  const next = timeline.currentFrame + 1;
  return next > totalFrames ? 1 : next;
}

function fireConstructFrame(timeline: Timeline): void {
  if (timeline.currentFrame !== timeline.lastFrameUpdate) {
    timeline.lastFrameUpdate = timeline.currentFrame;
    if (timeline.target !== null) timeline.source?.constructFrame(timeline.target, timeline.currentFrame);
  }
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
