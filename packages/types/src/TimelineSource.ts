import type { Entity } from './Entity';
import type { Node2D } from './Node2D';
import type { TimelineCue } from './TimelineCue';
import type { TimelineLabel } from './TimelineLabel';

// What a Timeline plays. A `TimelineSource` is the output of a "format" — hand-authored keyframes
// (`createTimelineSource`), a spritesheet animation (`createSpritesheetTimelineSource`), or a future
// imported SWF/Animate document. The Timeline engine owns *playback* (currentFrame, play/stop, looping,
// labels lookup); the source owns what a frame *is*. Splitting the two lets any format drive a MovieClip
// without the engine and the format depending on each other — both depend only on this contract.
export interface TimelineSource extends Entity {
  readonly totalFrames: number;
  readonly labels: readonly TimelineLabel[];
  // Edge-triggered cues the format authored onto frames — sounds, playhead commands, user-defined kinds.
  // Distinct from `constructFrame` because a cue is not idempotent and not seek-safe: it describes what
  // *entering* a frame does, not what the frame is. Nothing fires unless a handler is registered for the
  // kind, so a document imported for its artwork alone costs nothing here. Ordered by `frame`; a source
  // with no authored cues carries an empty array rather than null, so callers never branch on absence.
  readonly cues: readonly TimelineCue[];
  // Frames-per-second hint, or null to advance one frame per update (driven by the host loop's cadence).
  readonly frameRate: number | null;
  // Realizes the FULL display state for `frame` (1-based) onto `target`. Called by the engine on frame
  // entry. Must be seek-safe — jumping to any frame must produce that frame's state, and re-entering the
  // same frame must be idempotent — so random-access gotoAndStop works. The source may lazily create and
  // cache per-target content (e.g. a child bitmap) keyed off `target`, which keeps a source shareable
  // across many MovieClips.
  constructFrame(target: Node2D, frame: number): void;
}
