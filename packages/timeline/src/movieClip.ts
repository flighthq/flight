import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import type {
  FrameScript,
  MovieClip,
  MovieClipData,
  MovieClipRuntime,
  MovieClipSignals,
  PartialNode,
  TimelineLabel,
  TimelineSource,
} from '@flighthq/types';
import { EntityRuntimeKey, MovieClipKind } from '@flighthq/types';

import {
  addTimelineFrameScript,
  createTimeline,
  disposeTimelineSignals,
  enableTimelineSignals,
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

// The MovieClip display node lives here, with its playback engine — a MovieClip is a DisplayObject whose
// content is driven by a timeline, so the node and the engine that constructs its frames are one feature.
export function addMovieClipFrameScript(clip: MovieClip, frame: number | string, script: FrameScript): void {
  if (clip.data.timeline === null) return;
  addTimelineFrameScript(clip.data.timeline, frame, script);
}

export function createMovieClip(obj?: Readonly<PartialNode<MovieClip>>): MovieClip {
  return createDisplayObjectGeneric(MovieClipKind, obj, createMovieClipData, createMovieClipRuntime) as MovieClip;
}

export function createMovieClipData(data?: Readonly<Partial<MovieClipData>>): MovieClipData {
  return {
    timeline: data?.timeline ?? null,
  };
}

export function createMovieClipRuntime(): MovieClipRuntime {
  const out = createDisplayObjectRuntime() as MovieClipRuntime;
  out.movieClipSignals = null;
  return out;
}

export function disposeMovieClipSignals(clip: MovieClip): void {
  const runtime = clip[EntityRuntimeKey] as MovieClipRuntime;
  if (clip.data.timeline !== null) disposeTimelineSignals(clip.data.timeline);
  runtime.movieClipSignals = null;
}

// Allocates a MovieClipSignals group on the clip and arms per-frame signal emission. Idempotent —
// returns the same group on subsequent calls. Also enables the underlying timeline signals so the
// clip's signals fire when the timeline advances.
export function enableMovieClipSignals(clip: MovieClip): MovieClipSignals {
  const runtime = clip[EntityRuntimeKey] as MovieClipRuntime;
  if (runtime.movieClipSignals !== null) return runtime.movieClipSignals;
  // Ensure the timeline exists so signals can be armed even before setMovieClipSource is called.
  if (clip.data.timeline === null) clip.data.timeline = createTimeline();
  const signals = enableTimelineSignals(clip.data.timeline);
  runtime.movieClipSignals = signals;
  return signals;
}

export function getMovieClipCurrentFrame(clip: MovieClip): number {
  return clip.data.timeline?.currentFrame ?? 1;
}

export function getMovieClipCurrentLabel(clip: MovieClip): TimelineLabel | null {
  if (clip.data.timeline === null) return null;
  return getTimelineCurrentLabel(clip.data.timeline);
}

export function getMovieClipFrameScript(clip: MovieClip, frame: number | string): FrameScript | null {
  if (clip.data.timeline === null) return null;
  return getTimelineFrameScript(clip.data.timeline, frame);
}

export function getMovieClipRuntime(source: Readonly<MovieClip>): Readonly<MovieClipRuntime> {
  return getDisplayObjectRuntime(source) as MovieClipRuntime;
}

export function getMovieClipSignals(clip: MovieClip): MovieClipSignals | null {
  const runtime = clip[EntityRuntimeKey] as MovieClipRuntime;
  return runtime.movieClipSignals;
}

export function getMovieClipTotalFrames(clip: MovieClip): number {
  return clip.data.timeline?.source?.totalFrames ?? 1;
}

export function gotoAndPlayMovieClip(clip: MovieClip, frame: number | string): void {
  if (clip.data.timeline === null) return;
  gotoAndPlayTimeline(clip.data.timeline, frame);
}

export function gotoAndStopMovieClip(clip: MovieClip, frame: number | string): void {
  if (clip.data.timeline === null) return;
  gotoAndStopTimeline(clip.data.timeline, frame);
}

export function isMovieClipPlaying(clip: MovieClip): boolean {
  return clip.data.timeline?.isPlaying ?? false;
}

export function nextFrameMovieClip(clip: MovieClip): void {
  if (clip.data.timeline === null) return;
  nextFrameTimeline(clip.data.timeline);
}

export function playMovieClip(clip: MovieClip): void {
  if (clip.data.timeline === null) return;
  playTimeline(clip.data.timeline);
}

export function prevFrameMovieClip(clip: MovieClip): void {
  if (clip.data.timeline === null) return;
  prevFrameTimeline(clip.data.timeline);
}

export function removeMovieClipFrameScript(clip: MovieClip, frame: number | string): void {
  if (clip.data.timeline === null) return;
  removeTimelineFrameScript(clip.data.timeline, frame);
}

// Binds a TimelineSource to `clip`: gives it a timeline (reusing an existing one) pointed at the clip as
// its construct target, and realizes the initial frame so the clip isn't blank before play. The source
// comes from a format — createTimelineSource (hand-authored), createSpritesheetTimelineSource, etc.
export function setMovieClipSource(clip: MovieClip, source: TimelineSource): void {
  // Reuse the clip's existing timeline if it has one: enableMovieClipSignals may have already created and
  // armed it (storing the same group in runtime.movieClipSignals), so pointing a source at the same object
  // keeps those signals live with no re-wire needed — the runtime slot and timeline.signals are one group.
  const timeline = clip.data.timeline ?? createTimeline();
  timeline.source = source;
  timeline.target = clip;
  clip.data.timeline = timeline;
  gotoAndStopTimeline(timeline, timeline.currentFrame);
}

export function stopMovieClip(clip: MovieClip): void {
  if (clip.data.timeline === null) return;
  stopTimeline(clip.data.timeline);
}

export function updateMovieClip(clip: MovieClip, deltaTime: number): void {
  if (clip.data.timeline === null) return;
  updateTimeline(clip.data.timeline, deltaTime);
}
