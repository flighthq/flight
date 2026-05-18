import type { MovieClip } from '@flighthq/types';

import {
  gotoAndPlayTimeline,
  gotoAndStopTimeline,
  nextFrameTimeline,
  playTimeline,
  prevFrameTimeline,
  stopTimeline,
  updateTimeline,
} from './timeline';

export function getMovieClipCurrentFrame(clip: MovieClip): number {
  return clip.data.timeline?.currentFrame ?? 1;
}

export function getMovieClipTotalFrames(clip: MovieClip): number {
  return clip.data.timeline?.totalFrames ?? 1;
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

export function stopMovieClip(clip: MovieClip): void {
  if (clip.data.timeline === null) return;
  stopTimeline(clip.data.timeline);
}

export function updateMovieClip(clip: MovieClip, deltaTime: number): void {
  if (clip.data.timeline === null) return;
  updateTimeline(clip.data.timeline, deltaTime);
}
