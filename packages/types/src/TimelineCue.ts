import type { AudioResource } from './AudioResource';
import type { Entity } from './Entity';
import type { Timeline } from './Timeline';

// An edge-triggered cue authored onto a timeline frame: a sound to start, a playhead command, anything a
// format attached to a frame that is not frame *content*.
//
// This is a third seam alongside the timeline's existing two, and the split is contractual rather than
// stylistic:
//
//   TimelineSource.constructFrame — frame CONTENT. Idempotent and seek-safe by contract: re-entering a
//     frame must reproduce its state. A cue cannot live here. Starting a sound twice because someone
//     called gotoAndStop twice is not idempotent, and a goto that moved the playhead would not be
//     seek-safe. What a frame IS goes there; what entering it DOES cannot.
//   Timeline.frameScripts — the USER's arbitrary per-clip code, an opaque closure attached at runtime.
//   TimelineSource.cues (these) — AUTHORED cues, plain data, shared by every clip playing the source. An
//     importer emits these and never a closure, so an imported document stays serializable, inspectable,
//     and portable, and a format parser never depends on the subsystem a cue drives.
//
// Cues are kind-dispatched through an open registry, the same doctrine as renderer registration: a
// handler registers against a kind, unregistered kinds are inert and shake out, and a user adds their own
// (vendor-prefixed) kind without touching this file. Nothing here plays, seeks, or allocates — a cue is a
// description of intent that only a registered handler acts on.
//
// Not to be confused with `TimelineFrameEvent`, which is the payload of the per-frame *signals*
// (onEnterFrame / onExitFrame). That reports that a frame boundary happened; a cue is authored content
// carried by the source.

export const TimelineAudioCueKind = 'Audio';
export const TimelineGotoCueKind = 'Goto';
export const TimelineNextFrameCueKind = 'NextFrame';
export const TimelinePlayCueKind = 'Play';
export const TimelinePreviousFrameCueKind = 'PreviousFrame';
export const TimelineStopCueKind = 'Stop';
export const TimelineStreamAudioCueKind = 'StreamAudio';

// Why the playhead arrived at the frame being dispatched. Handlers receive it so one kind can behave
// differently on a scrub than on ordinary playback — a stream sound resyncs to the new position where an
// event sound would simply not fire.
export const TimelineFrameEntryCause = {
  // Ordinary sequential playback, one frame to the next.
  Advance: 'Advance',
  // A jump: a goto cue, a gotoAndPlay/gotoAndStop call, or any other non-sequential move.
  Seek: 'Seek',
} as const;

export type TimelineFrameEntryCause = (typeof TimelineFrameEntryCause)[keyof typeof TimelineFrameEntryCause];

// The base every cue shares. `kind` is an open plain string, not a closed union: it is the registry key,
// the serialized form, and the user-facing vocabulary at once.
export interface TimelineCue extends Entity {
  // 1-based, matching Timeline.currentFrame and TimelineLabel.
  frame: number;
  kind: string;
}

// One point of a cue's gain automation. Stereo rather than a single level because real content uses it:
// authoring tools write a pan by moving the two channels apart, so a scalar would silently centre it.
export interface TimelineAudioEnvelopePoint {
  leftGain: number;
  rightGain: number;
  // Seconds from the start of playback. Formats count this in their own units — SWF in 44.1kHz samples
  // whatever the sound's own rate — so the importer converts and the handler never does format arithmetic.
  time: number;
}

// Starts (or stops) one sound. `resource` is the live entity a document's AudioResourceReference fills on
// decode, held directly rather than by name: the same resource is shared by every cue referencing it, so a
// sound cued from forty frames decodes once and all forty cues are wired the moment it resolves. Two sounds
// at once are two cues on one frame, which is why nothing here is a list of sounds.
export interface TimelineAudioCue extends TimelineCue {
  kind: 'Audio';
  // Seconds of the source to play from `offset`, or null for the rest of it. Named for the platform call a
  // handler makes — start(when, offset, duration) — rather than the authored in/out-point vocabulary.
  duration: number | null;
  gain: number;
  // Gain automation over the sound, empty when the format authored none. A one-point envelope is a static
  // level-and-pan rather than a curve, which is why this cannot fold into `gain`.
  envelope: readonly TimelineAudioEnvelopePoint[];
  loops: number;
  // Seconds into the source where playback begins.
  offset: number;
  resource: AudioResource;
  // Do not start if this resource is already playing — Flash's "Start" sync, as against "Event", which
  // stacks a fresh copy on every entry. What keeps a looping track cued on a re-entered frame from
  // layering copies of itself.
  skipIfPlaying: boolean;
  // Stops this resource's playback instead of starting it (SWF SOUNDINFO's SyncStop).
  stop: boolean;
}

// Starts a sound authored to run *with* a stretch of timeline rather than to fire at a point on it — a
// SWF stream sound, whose frames were interleaved with the display list so playback and playhead advance
// together.
//
// It is a separate kind from TimelineAudioCue rather than a flag on it because the two need opposite seek
// behaviour, and dispatchOnSeek is registered per kind: scrubbing past an event sound must not fire it,
// while scrubbing a stream must resync it to the new position. A handler computes that position from the
// distance between the timeline's current frame and this cue's `frame`, which is where the stream starts.
export interface TimelineStreamAudioCue extends TimelineCue {
  kind: 'StreamAudio';
  gain: number;
  resource: AudioResource;
}

// Moves the playhead. Exactly one of `targetFrame` / `targetLabel` is non-null. A goto only *moves*:
// whether playback continues is decided by a Play or Stop cue, which is how the authored form works and
// why this carries no resume flag.
export interface TimelineGotoCue extends TimelineCue {
  kind: 'Goto';
  targetFrame: number | null;
  targetLabel: string | null;
}

// Play, Stop, NextFrame, and PreviousFrame carry no payload beyond the base — the kind is the whole
// command.
export interface TimelinePlaybackCue extends TimelineCue {
  kind: 'NextFrame' | 'Play' | 'PreviousFrame' | 'Stop';
}

// Acts on one cue. Receives the timeline (whose `target` is the construct node) so a playback cue can
// drive the playhead it is attached to, and the entry cause so a handler can distinguish a scrub.
export type TimelineCueHandler = (
  timeline: Timeline,
  cue: Readonly<TimelineCue>,
  cause: TimelineFrameEntryCause,
) => void;

export interface TimelineCueHandlerEntry {
  // Whether this kind is dispatched when the frame was reached by a jump rather than by playing into it.
  // The two built-in families deliberately differ: playback cues are true, because gotoAndStop(1) must run
  // frame 1's Stop or the most common authored idiom breaks; event audio is false, so scrubbing a timeline
  // does not machine-gun every sound it passes. A handler that wants to *react* to seeks rather than
  // ignore them (a stream sound resyncing) sets this true and branches on the cause it is handed.
  dispatchOnSeek: boolean;
  handle: TimelineCueHandler;
  kind: string;
}

// Registered handlers, held on an entity rather than in module state so two timelines can dispatch
// different kind sets and nothing is global. Last-write-wins per kind, matching renderer registration.
export interface TimelineCueRegistry extends Entity {
  entries: TimelineCueHandlerEntry[];
}
