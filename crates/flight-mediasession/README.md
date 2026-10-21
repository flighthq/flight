# flight-mediasession

The OS media session (TS `@flighthq/mediasession`), routed only through host capabilities, with no real OS session, playback or device provider:
- **`HostMediaSessionCapability`** handles commands: metadata, playback state, position state and clear.
- **`HostMediaSessionActionCapability`** handles per-action subscriptions.

Each `MediaSessionActionSignal` entity carries one action and its `on_action` signal. Attaching first releases the prior origin. A None subscription is a truthful refusal. A failing release stays registered for retry, and dispose clears the signal even when detach throws. `destroy_media_session` tries each distinct provider once (identity is the provider's `destroy` callback) and re-raises the first failure after trying the others. Position input is classified locally, as the W3C algorithm does, before the provider sees it.

## Precision

Seek times, offsets, duration, position and playback rate are `f32` seconds. They are single targets relayed to the platform and never accumulated; f32 resolves about 8 ms even at 24 hours.
