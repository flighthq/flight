# @flighthq/media status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/media` by merging the gitignored build output (`dist/*.js` impl + `dist/*.d.ts` types) back into `src/`. The integration curation had pruned both channel modules down to a subset of their original exported functions, and had dropped the `audioMixer` module entirely.

The hard boundary forbids editing `@flighthq/types`. Several dist functions depend on types or type-fields that are NOT present in `packages/types/src/`, so those were parked rather than recovered (recovering them would require adding to `@flighthq/types`). Note: dist was built against an older layout that imported `getAudioContext`/`createAudioResource` from `@flighthq/resources`; the current package depends on `@flighthq/audio`/`@flighthq/video`, so recovered code keeps the current imports.

### Recovered

`audioChannel.ts` — added (with colocated tests):

- `fadeAudioChannelGain(channel, targetGain, durationMs)` — ramps gain via the live gain node; falls back to setting `channel.gain` when no node is active.
- `getAudioChannelDuration(channel)` — returns `channel.length`.
- `getAudioChannelInputNode(channel)` — runtime source node or `null`.
- `getAudioChannelOutputNode(channel)` — runtime gain node or `null`.
- `isAudioChannelPlaying(channel)` — `channel.state === 'playing'`.

`videoChannel.ts` — added (with colocated tests):

- `getVideoChannelDuration(channel)` — returns `channel.length`.
- `getVideoChannelHeight(channel)` — element `videoHeight`, sentinel `0` when detached.
- `getVideoChannelWidth(channel)` — element `videoWidth`, sentinel `0` when detached.
- `isVideoChannelPlaying(channel)` — `channel.state === 'playing'`.

(The video test mock `MockVideoElement` was extended with `videoWidth`/`videoHeight` and the `createMockVideoElement` helper now takes optional height/width args.)

### Skipped (prune-fossil)

None. Nothing tied to a deliberately-dropped/deprecated concept was found in the lost set.

### Parked (need types not present in @flighthq/types)

Module — `audioMixer` (whole `dist/audioMixer.js`): `addAudioBusToMixer`, `createAudioBus`, `createAudioMixer`, `fadeAudioBusGain`, `getAudioMixerActiveChannels`, `pauseAllAudioMixerChannels`, `resumeAllAudioMixerChannels`, `routeAudioChannelToMixerBus`, `setAudioBusGain`, `setAudioBusMuted`, `setAudioBusPan`, `setAudioMixerMasterGain`, `setAudioMixerMasterMuted`, `stopAllAudioMixerChannels`, `unrouteAudioChannelFromMixerBus`. Reason: needs types `AudioBus`, `AudioBusOptions`, `AudioMixer`, `AudioMixerOptions` in `@flighthq/types` (none exist; `AudioResource.ts` defines only `AudioChannel`/`AudioPlayOptions`). This is a genuine mixer sub-library (buses, panning, master gain, channel routing) worth restoring once the types are added — surface it to the user as a types-layer gap.

Functions parked in `audioChannel` (need `MediaChannelSignals` type or missing `AudioChannel` fields `muted`/`pan`/`loopStart`/`loopEnd`): `connectAudioChannelToNode` (also needs the richer runtime `destinationNode` slot), `disposeAudioChannel`, `enableAudioChannelSignals`, `getAudioChannelSignals`, `getAudioChannelPan`, `isAudioChannelMuted`, `setAudioChannelLoopEnd`, `setAudioChannelLoopStart`, `setAudioChannelMuted`, `setAudioChannelPan`.

Functions parked in `videoChannel` (need `MediaChannelSignals` type or missing `VideoChannel.muted` field): `disposeVideoChannel`, `enableVideoChannelSignals`, `getVideoChannelSignals`, `isVideoChannelMuted`, `setVideoChannelMuted`.

Types gap to surface to the user (would unblock all parked items): add to `@flighthq/types` — `MediaChannelSignals` (onBuffering/onError/onReady/onSeeked signals); extend `AudioChannel` with `loopStart`/`loopEnd`/`muted`/`pan` and `AudioPlayOptions` to match; extend `VideoChannel` with `muted` and `VideoPlayOptions` to match; add `AudioBus`/`AudioBusOptions`/`AudioMixer`/ `AudioMixerOptions` for the mixer module.

### Test result

`npm run test --workspace=packages/media`: 2 files, 33 tests, all passing.

## 2026-06-25 — builder R2-4 second-pass recovery

Second pass over the lost set now that the parallel types-recovery pass landed the audio-mixer and `MediaChannelSignals` types into `@flighthq/types`.

### Recovered

- Module `audioMixer` (whole `dist/audioMixer.js` + `dist/audioMixer.test.js`) — `addAudioBusToMixer`, `createAudioBus`, `createAudioMixer`, `fadeAudioBusGain`, `getAudioMixerActiveChannels`, `pauseAllAudioMixerChannels`, `resumeAllAudioMixerChannels`, `routeAudioChannelToMixerBus`, `setAudioBusGain`, `setAudioBusMuted`, `setAudioBusPan`, `setAudioMixerMasterGain`, `setAudioMixerMasterMuted`, `stopAllAudioMixerChannels`, `unrouteAudioChannelFromMixerBus`. The previously-missing types `AudioBus`/`AudioBusOptions`/`AudioMixer`/`AudioMixerOptions` now exist in `@flighthq/types` (defined in `AudioBus.ts`), so the module is unblocked. Ported the dist's stale `@flighthq/resources` import to the current `@flighthq/audio` (`getAudioContext`); typed the previously-implicit `AudioMixerRuntime`; kept all `//` comments verbatim. Added `export * from './audioMixer'` to `index.ts` (alphabetized). Recovered the colocated test (16 describe blocks, alphabetized), porting `createAudioResource` import from `@flighthq/resources` to `@flighthq/audio`.
- `connectAudioChannelToNode` into `audioChannel.ts` (was parked last pass). audioMixer routing depends on it. Added minimally: it reroutes the live gain node (disconnect/reconnect) and records a new `destinationNode` runtime slot so routing survives a stop/restart; `startAudioChannel` now connects to `runtime.destinationNode ?? runtime.context.destination`. No behavioral change to existing functions. Added a colocated test (alphabetized first) and a `disconnect()` method to the existing test mock gain node.

### Skipped (prune-fossil)

None this pass.

### Parked

- audioChannel signals/mute/pan/loop family — `disposeAudioChannel`, `enableAudioChannelSignals`, `getAudioChannelSignals`, `getAudioChannelPan`, `isAudioChannelMuted`, `setAudioChannelLoopEnd`, `setAudioChannelLoopStart`, `setAudioChannelMuted`, `setAudioChannelPan`. The `MediaChannelSignals` type now exists, but the `AudioChannel` interface still lacks the `muted`/`pan`/`loopStart`/`loopEnd` fields these read/write, and the pass-1 `audioChannel.ts` has no signals subsystem (runtime signal-listener slot, attach/detach helpers, `enable*`/`get*Signals` storage). Re-introducing it on audio alone, against a type that lacks the fields, is a design decision — surface to the user.
- videoChannel signals/mute family — `disposeVideoChannel`, `enableVideoChannelSignals`, `getVideoChannelSignals`, `isVideoChannelMuted`, `setVideoChannelMuted`. `MediaChannelSignals` now exists, but `VideoChannel` still lacks a `muted` field (for the mute pair), and the signals trio needs the same signals subsystem (runtime `signalListeners`, `attachSignalListeners`/`detachSignalListeners`, `createAndStoreVideoChannelSignals`) that pass-1 `videoChannel.ts` does not carry — recovering it on video alone breaks audio/video symmetry. Design decision; surface to the user.

Types gap to surface to the user (would unblock the remaining parked items): extend `AudioChannel` with `loopStart`/`loopEnd`/`muted`/`pan` (and `AudioPlayOptions` to match) and `VideoChannel` with `muted` (and `VideoPlayOptions` to match) in `@flighthq/types`, then re-add the media-channel signals subsystem symmetrically across audio and video.

### Test result

`npm run test --workspace=packages/media`: 3 files, 54 tests, all passing.
