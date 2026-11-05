import type { AudioChannelState, AudioResource } from '@flighthq/audio/contract';
import type { Signal } from '@flighthq/signals/contract';

/** @deprecated Import audio-owned contracts from `@flighthq/audio/contract`. */
export type { AudioChannelState, AudioPlayOptions, AudioResource, AudioResourceUrl } from '@flighthq/audio/contract';

export interface AudioChannel {
  currentTime: number;
  gain: number;
  length: number;
  // Sub-region of the buffer each pass plays, in milliseconds. `loopEnd` of 0 means no region: the
  // pass runs to the end of the buffer. The region bounds each pass; `loops` still counts them.
  loopEnd: number;
  loops: number;
  loopStart: number;
  // Silences output without disturbing `gain`, so unmuting restores the level the caller set. A muted
  // channel keeps playing and keeps advancing its time — this is not a pause.
  muted: boolean;
  // Stereo placement: -1 hard left, 0 centre, 1 hard right. Clamped to that range by
  // setAudioChannelPan, the way currentTime is clamped to its own bounded domain.
  pan: number;
  playbackRate: number;
  source: AudioResource;
  state: AudioChannelState;
  onComplete: Signal<void>;
}
