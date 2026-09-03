import type { Signal } from './Signal';
export type MediaReadyState = 'buffering' | 'error' | 'idle' | 'ready';
// Opt-in notification for one media channel, enabled per channel through enableAudioChannelSignals /
// enableVideoChannelSignals so a caller that never asks pays nothing.
//
// The playback-lifecycle half — complete, loop, pause, play, stop — is produced by the channel's own
// state machine. The readiness half — buffering, error, ready, seeked — describes transport state that
// only a backend or a DOM element can report; those are declared here and are NOT yet produced for
// audio, which has no such seam.
export interface MediaChannelSignals {
  onBuffering: Signal<() => void>;
  // Fires when a channel finishes its last pass. The channel's own `onComplete` still fires too; this
  // one exists so a caller that opted into signals reads every lifecycle event from one place.
  onComplete: Signal<() => void>;
  onError: Signal<(error: string) => void>;
  // Fires once per loop iteration, after the count is spent and before the next pass starts.
  onLoop: Signal<() => void>;
  onPause: Signal<() => void>;
  // Fires when a caller starts or resumes playback — not on a loop iteration or a seek restart.
  onPlay: Signal<() => void>;
  onReady: Signal<() => void>;
  onSeeked: Signal<() => void>;
  onStop: Signal<() => void>;
}
