import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { createSignal } from '@flighthq/signals';
import type {
  MovieClip,
  MovieClipData,
  MovieClipRuntime,
  MovieClipSignals,
  PartialNode,
  TimelineSource,
} from '@flighthq/types';
import { EntityRuntimeKey, MovieClipKind } from '@flighthq/types';

import {
  createTimeline,
  gotoAndPlayTimeline,
  gotoAndStopTimeline,
  nextFrameTimeline,
  playTimeline,
  prevFrameTimeline,
  stopTimeline,
  updateTimeline,
} from './timeline';

// The MovieClip display node lives here, with its playback engine — a MovieClip is a DisplayObject whose
// content is driven by a timeline, so the node and the engine that constructs its frames are one feature.
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

export function createMovieClipSignals(): MovieClipSignals {
  return {
    onEnterFrame: createSignal(),
    onExitFrame: createSignal(),
    onFrameConstructed: createSignal(),
  };
}

export function getMovieClipCurrentFrame(clip: MovieClip): number {
  return clip.data.timeline?.currentFrame ?? 1;
}

export function getMovieClipRuntime(source: Readonly<MovieClip>): Readonly<MovieClipRuntime> {
  return getDisplayObjectRuntime(source) as MovieClipRuntime;
}

export function getMovieClipSignals(clip: MovieClip): MovieClipSignals {
  const runtime = clip[EntityRuntimeKey] as MovieClipRuntime;
  return (runtime.movieClipSignals ??= createMovieClipSignals());
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

// Binds a TimelineSource to `clip`: gives it a timeline (reusing an existing one) pointed at the clip as
// its construct target, and realizes the initial frame so the clip isn't blank before play. The source
// comes from a format — createTimelineSource (hand-authored), createSpritesheetTimelineSource, etc.
export function setMovieClipSource(clip: MovieClip, source: TimelineSource): void {
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
