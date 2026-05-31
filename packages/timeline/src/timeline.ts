import type { Timeline, TimelineLabel } from '@flighthq/types';

export function createTimeline(obj?: Partial<Timeline>): Timeline {
  return {
    currentFrame: obj?.currentFrame ?? 1,
    frameRate: obj?.frameRate ?? null,
    isPlaying: obj?.isPlaying ?? false,
    labels: obj?.labels ?? [],
    lastFrameUpdate: -1,
    constructFrame: obj?.constructFrame ?? null,
    timeElapsed: 0,
    totalFrames: obj?.totalFrames ?? 1,
  };
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
  if (timeline.isPlaying || timeline.totalFrames < 2) return;
  timeline.isPlaying = true;
  timeline.timeElapsed = 0;
}

export function prevFrameTimeline(timeline: Timeline): void {
  stopTimeline(timeline);
  seekTimeline(timeline, timeline.currentFrame - 1);
}

export function resolveTimelineLabel(timeline: Readonly<Timeline>, name: string): TimelineLabel | null {
  return timeline.labels.find((l) => l.name === name) ?? null;
}

export function stopTimeline(timeline: Timeline): void {
  timeline.isPlaying = false;
}

export function updateTimeline(timeline: Timeline, deltaTime: number): void {
  if (timeline.isPlaying && timeline.frameRate !== null) {
    timeline.currentFrame = advanceFrame(timeline, deltaTime);
  }
  fireConstructFrame(timeline);
  if (timeline.isPlaying && timeline.frameRate === null) {
    timeline.currentFrame = advanceFrame(timeline, deltaTime);
  }
}

function advanceFrame(timeline: Timeline, deltaTime: number): number {
  if (timeline.frameRate !== null) {
    const frameTime = 1000 / timeline.frameRate;
    timeline.timeElapsed += deltaTime;
    let next = timeline.currentFrame + Math.floor(timeline.timeElapsed / frameTime);
    timeline.timeElapsed %= frameTime;
    if (next > timeline.totalFrames) next = ((next - 1) % timeline.totalFrames) + 1;
    return next;
  }
  const next = timeline.currentFrame + 1;
  return next > timeline.totalFrames ? 1 : next;
}

function fireConstructFrame(timeline: Timeline): void {
  if (timeline.currentFrame !== timeline.lastFrameUpdate) {
    timeline.lastFrameUpdate = timeline.currentFrame;
    timeline.constructFrame?.(timeline.currentFrame);
  }
}

function resolveFrame(timeline: Readonly<Timeline>, frame: number | string): number {
  if (typeof frame === 'number') return frame;
  const label = resolveTimelineLabel(timeline, frame);
  if (!label) throw new Error(`Frame label "${frame}" not found`);
  return label.frame;
}

function seekTimeline(timeline: Timeline, frame: number): void {
  timeline.currentFrame = Math.max(1, Math.min(frame, timeline.totalFrames));
  timeline.lastFrameUpdate = -1;
  fireConstructFrame(timeline);
}
