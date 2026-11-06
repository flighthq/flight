/** @deprecated Import timeline contracts from `@flighthq/timeline/contract`. */
export type {
  FrameScript,
  Timeline,
  TimelineAudioCue,
  TimelineAudioEnvelopePoint,
  TimelineCue,
  TimelineCueHandler,
  TimelineCueHandlerEntry,
  TimelineCueRegistry,
  TimelineFrameEvent,
  TimelineGotoCue,
  TimelineLabel,
  TimelinePlayMode,
  TimelinePlaybackCue,
  TimelineSignals,
  TimelineSource,
  TimelineStreamAudioCue,
} from '@flighthq/timeline/contract';

/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelineAudioCueKind = 'Audio';
/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelineGotoCueKind = 'Goto';
/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelineNextFrameCueKind = 'NextFrame';
/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelinePlayCueKind = 'Play';
/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelinePreviousFrameCueKind = 'PreviousFrame';
/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelineStopCueKind = 'Stop';
/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelineStreamAudioCueKind = 'StreamAudio';

/** @deprecated Import from `@flighthq/timeline/contract`. */
export const TimelineFrameEntryCause = {
  Advance: 'Advance',
  Seek: 'Seek',
} as const;

/** @deprecated Import from `@flighthq/timeline/contract`. */
export type TimelineFrameEntryCause = (typeof TimelineFrameEntryCause)[keyof typeof TimelineFrameEntryCause];
