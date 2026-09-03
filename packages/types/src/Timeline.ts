import type { Entity } from './Entity';
import type { FrameScript } from './FrameScript';
import type { Node2D } from './Node2D';
import type { TimelineCueRegistry } from './TimelineCue';
import type { TimelinePlayMode } from './TimelinePlayMode';
import type { TimelineSignals } from './TimelineSignals';
import type { TimelineSource } from './TimelineSource';

// Playback state for a MovieClip's timeline: a playhead bound to a `source` (the per-frame content) and
// a `target` (the display node the source constructs onto). The source is shareable across MovieClips;
// this playback — currentFrame, isPlaying, timing — is per-clip. totalFrames / frameRate / labels are
// read from the source, not stored here.
export interface Timeline extends Entity {
  source: TimelineSource | null;
  target: Node2D | null;
  currentFrame: number;
  // Handlers for the source's authored cues. Null until a caller opts in, which is what keeps audio and
  // every other cue subsystem out of a timeline that only animates: with no registry the source's cues
  // are inert data and the handling packages shake out entirely. One registry is normally shared by every
  // timeline in an application — it is per-timeline to avoid module state, not to be built per clip.
  cueRegistry: TimelineCueRegistry | null;
  // Per-frame scripts keyed by 1-based frame number; null until the first script is attached and reset
  // to null when the last is removed. The USER's arbitrary code, distinct from the source's authored
  // cues: this is attached at runtime to one clip, those are plain data shared by every clip.
  frameScripts: Map<number, FrameScript> | null;
  isPlaying: boolean;
  timeElapsed: number;
  lastFrameUpdate: number;
  playMode: TimelinePlayMode;
  // Lifecycle signals, allocated lazily by enableTimelineSignals; null until opted in.
  signals: TimelineSignals | null;
}
