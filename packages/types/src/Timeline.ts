import type { DisplayObject } from './DisplayObject';
import type { TimelineSource } from './TimelineSource';

// Playback state for a MovieClip's timeline: a playhead bound to a `source` (the per-frame content) and
// a `target` (the display node the source constructs onto). The source is shareable across MovieClips;
// this playback — currentFrame, isPlaying, timing — is per-clip. totalFrames / frameRate / labels are
// read from the source, not stored here.
export interface Timeline {
  source: TimelineSource | null;
  target: DisplayObject | null;
  currentFrame: number;
  isPlaying: boolean;
  timeElapsed: number;
  lastFrameUpdate: number;
}
