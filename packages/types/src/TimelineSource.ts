import type { DisplayObject } from './DisplayObject';
import type { TimelineLabel } from './TimelineLabel';

// What a Timeline plays. A `TimelineSource` is the output of a "format" — hand-authored keyframes
// (`createTimelineSource`), a spritesheet animation (`createSpritesheetTimelineSource`), or a future
// imported SWF/Animate document. The Timeline engine owns *playback* (currentFrame, play/stop, looping,
// labels lookup); the source owns what a frame *is*. Splitting the two lets any format drive a MovieClip
// without the engine and the format depending on each other — both depend only on this contract.
export interface TimelineSource {
  readonly totalFrames: number;
  readonly labels: readonly TimelineLabel[];
  // Frames-per-second hint, or null to advance one frame per update (driven by the host loop's cadence).
  readonly frameRate: number | null;
  // Realizes the FULL display state for `frame` (1-based) onto `target`. Called by the engine on frame
  // entry. Must be seek-safe — jumping to any frame must produce that frame's state, and re-entering the
  // same frame must be idempotent — so random-access gotoAndStop works. The source may lazily create and
  // cache per-target content (e.g. a child bitmap) keyed off `target`, which keeps a source shareable
  // across many MovieClips.
  constructFrame(target: DisplayObject, frame: number): void;
}
