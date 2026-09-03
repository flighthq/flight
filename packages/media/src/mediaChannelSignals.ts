import { createSignal } from '@flighthq/signals/contract';
import type { AudioChannel, MediaChannelSignals, VideoChannel } from '@flighthq/types/contract';

// Opt-in per channel, following the SDK's enable*Signals shape: nothing is allocated until a caller
// asks, and every producer is a null check until then. Held in a WeakMap keyed by the channel rather
// than on the playback runtime, so enabling works before playback and survives a stop — a caller that
// wired listeners does not lose them because the source was torn down and rebuilt.
export function enableAudioChannelSignals(channel: AudioChannel): MediaChannelSignals {
  return enableChannelSignals(channel);
}

export function enableVideoChannelSignals(channel: VideoChannel): MediaChannelSignals {
  return enableChannelSignals(channel);
}

export function getAudioChannelSignals(channel: Readonly<AudioChannel>): MediaChannelSignals | null {
  return channelSignals.get(channel) ?? null;
}

export function getVideoChannelSignals(channel: Readonly<VideoChannel>): MediaChannelSignals | null {
  return channelSignals.get(channel) ?? null;
}

function enableChannelSignals(channel: object): MediaChannelSignals {
  let signals = channelSignals.get(channel);
  if (signals === undefined) {
    signals = {
      onBuffering: createSignal(),
      onComplete: createSignal(),
      onError: createSignal(),
      onLoop: createSignal(),
      onPause: createSignal(),
      onPlay: createSignal(),
      onReady: createSignal(),
      onSeeked: createSignal(),
      onStop: createSignal(),
    };
    channelSignals.set(channel, signals);
  }
  return signals;
}

const channelSignals = new WeakMap<object, MediaChannelSignals>();
