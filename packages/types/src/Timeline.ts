import type { DisplayObject } from './DisplayObject';
import type { FrameScript } from './FrameScript';
import type { TimelinePlayMode } from './TimelinePlayMode';
import type { TimelineSignals } from './TimelineSignals';
import type { TimelineSource } from './TimelineSource';

// Playback state for a MovieClip's timeline: a playhead bound to a `source` (the per-frame content) and
// a `target` (the display node the source constructs onto). The source is shareable across MovieClips;
// this playback — currentFrame, isPlaying, timing — is per-clip. totalFrames / frameRate / labels are
// read from the source, not stored here.
export interface Timeline {
  source: TimelineSource | null;
  target: DisplayObject | null;
  currentFrame: number;
  // Per-frame scripts keyed by 1-based frame number; null until the first script is attached and reset
  // to null when the last is removed.
  frameScripts: Map<number, FrameScript> | null;
  isPlaying: boolean;
  timeElapsed: number;
  lastFrameUpdate: number;
  playMode: TimelinePlayMode;
  // Lifecycle signals, allocated lazily by enableTimelineSignals; null until opted in.
  signals: TimelineSignals | null;
}
