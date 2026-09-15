# Media host-seam: eliminate browser API references from the portable media package

## Problem

The `@flighthq/media` package has three files with deep browser API dependencies that prevent portability:

1. **videoChannel.ts** — 15+ `HTMLVideoElement` references for play/pause/seek/volume/rate/mute/loop/events. No provider pattern; casts `resource.element as HTMLVideoElement` directly.

2. **audioDeviceBackend.ts** — `createWebAudioDeviceBackend()` is a web backend implementation living in the portable package. Uses `AudioContext`, `AudioBuffer`, `AudioBufferSourceNode`, `GainNode`, `StereoPannerNode`. The `HostAudioDeviceProvider` handle interface already exists and works — the implementation is just in the wrong package. Web-extension helpers (`getAudioSourceGainNode`, `getAudioSourceBufferSourceNode`) expose Web Audio types as return values.

3. **audioMixer.ts** — Takes `AudioContext` directly in `createAudioMixer(context, options)`. Internally creates and manages a Web Audio node graph (`GainNode`, `StereoPannerNode`, `context.createGain()`, `context.createStereoPanner()`, `context.destination`, scheduled parameter ramps). The mixer IS a Web Audio graph manager.

4. **audioChannel.ts** — Exposes `AudioNode` in public APIs: `connectAudioChannelToNode(channel, destinationNode: AudioNode)`, `getAudioChannelInputNode(): AudioNode | null`, `getAudioChannelOutputNode(): AudioNode | null`. Uses `GainNode` for fade scheduling via `cancelScheduledValues`/`setValueAtTime`/`linearRampToValueAtTime`.

## Design rule

**Use the type freely, acquire it through the host.** Same rule as GL contexts, sockets, and the video resource seam. The portable media package should never name `HTMLVideoElement`, `AudioContext`, `GainNode`, `StereoPannerNode`, `AudioBufferSourceNode`, or `AudioNode`. It interacts with these exclusively through provider methods that the web backend implements internally.

## Work items

### 1. Video channel playback — extend HostVideoProvider

The existing `HostVideoProvider` covers video resource operations (create, load, dimensions, readiness). The video channel needs playback control. Add playback methods to `HostVideoProvider`:

```typescript
// Added to HostVideoProvider in @flighthq/types:
play(element: HostImageSource): Promise<void>;
pause(element: HostImageSource): void;
getCurrentTime(element: HostImageSource): number;
setCurrentTime(element: HostImageSource, seconds: number): void;
setVolume(element: HostImageSource, value: number): void;
setPlaybackRate(element: HostImageSource, value: number): void;
setMuted(element: HostImageSource, value: boolean): void;
setLoop(element: HostImageSource, value: boolean): void;
addEndedListener(element: HostImageSource, listener: () => void): void;
removeEndedListener(element: HostImageSource, listener: () => void): void;
```

Then refactor `videoChannel.ts`:
- Replace `getVideoElement()` helper (which casts to `HTMLVideoElement`) with provider method calls
- `playVideoResource` takes `HostVideoProvider` as first parameter
- `destroyVideoChannel`, `pauseVideoChannel`, `resumeVideoChannel`, `stopVideoChannel`, `setVideoChannel*` take `HostVideoProvider` as first parameter
- `getVideoChannelHeight/Width` delegate to `provider.getHeight/getWidth`
- `getVideoChannelCurrentTime` delegates to `provider.getCurrentTime`
- `channelElements` WeakMap changes from `WeakMap<VideoChannel, HTMLVideoElement>` to `WeakMap<VideoChannel, HostImageSource>`
- `videoChannelRuntimes` WeakMap changes similarly (may need an alternative key strategy since `HostImageSource` is opaque)

Web implementation: extend the existing `webVideoCapability.ts` in host-web with the new playback methods, each internally casting to `HTMLVideoElement`.

### 2. Audio device backend — relocate to host-web

Move from `media/src/audioDeviceBackend.ts` to `host-web/src/webAudioDevice.ts`:
- `createWebAudioDeviceBackend` — already correctly Web-prefixed
- `initializeWebAudioDeviceBackend` — initializer, moves with factory
- Web-extension helpers that return Web Audio types:
  - `getAudioSourceGainNode` → returns `GainNode | null`
  - `getAudioSourceBufferSourceNode` → returns `AudioBufferSourceNode | null`
  - `hasAudioDeviceWebNodeAccess` → checks for web extension

The `HostAudioDeviceProvider` interface stays in `@flighthq/types` (already there). The portable `media` package imports only the type and uses only the handle-based methods.

### 3. Audio mixer seam — HostAudioMixerProvider

The mixer manages a Web Audio node graph internally. The state machine (tracking buses, channels, pause/resume sets) is portable; the graph operations are platform-specific.

New interface in `@flighthq/types`:

```typescript
interface HostAudioMixerProvider extends Entity {
  // Lifecycle
  createMixerGraph(device: AudioDeviceHandle, masterGain: number): AudioMixerGraphHandle;
  destroyMixerGraph(graph: AudioMixerGraphHandle): void;

  // Bus management
  createBusNode(graph: AudioMixerGraphHandle, gain: number, pan: number): AudioBusNodeHandle;
  destroyBusNode(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle): void;

  // Bus parameters
  setBusNodeGain(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, gain: number): void;
  setBusNodePan(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, pan: number): void;
  fadeBusNodeGain(
    graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle,
    target: number, durationMs: number,
  ): void;

  // Master
  setMasterGain(graph: AudioMixerGraphHandle, gain: number): void;

  // Routing — connects a source (from HostAudioDeviceProvider) to a bus
  routeSourceToBus(
    graph: AudioMixerGraphHandle, source: AudioSourceHandle, bus: AudioBusNodeHandle,
  ): void;
  unrouteSource(
    graph: AudioMixerGraphHandle, source: AudioSourceHandle,
  ): void;
  // Reconnect a source to the device's default output (post-unroute)
  routeSourceToDefault(graph: AudioMixerGraphHandle, source: AudioSourceHandle): void;
}
```

With opaque handle types (same pattern as `AudioDeviceHandle` / `AudioSourceHandle`):

```typescript
declare const audioMixerGraphHandleBrand: unique symbol;
export type AudioMixerGraphHandle = number & { readonly [audioMixerGraphHandleBrand]: never };

declare const audioBusNodeHandleBrand: unique symbol;
export type AudioBusNodeHandle = number & { readonly [audioBusNodeHandleBrand]: never };
```

Then refactor `audioMixer.ts`:
- `createAudioMixer(context: AudioContext, options?)` → `createAudioMixer(mixerProvider: HostAudioMixerProvider, device: AudioDeviceHandle, options?)`
- The `AudioMixerRuntime` drops all Web Audio types — stores `graph: AudioMixerGraphHandle` and `Map<AudioBus, AudioBusNodeHandle>` instead of `Map<AudioBus, GainNode>`
- `addAudioBusToMixer` calls `mixerProvider.createBusNode(graph, gain, pan)` instead of `context.createGain()` + `context.createStereoPanner()`
- `fadeAudioBusGain` calls `mixerProvider.fadeBusNodeGain` instead of direct `cancelScheduledValues`/`linearRampToValueAtTime`
- `routeAudioChannelToMixerBus` calls `mixerProvider.routeSourceToBus` instead of `connectAudioChannelToNode`
- `unrouteAudioChannelFromMixerBus` calls `mixerProvider.routeSourceToDefault` instead of `connectAudioChannelToNode(channel, context.destination)`
- `destroyAudioMixer` calls `mixerProvider.destroyMixerGraph`

Web implementation: `createWebAudioMixerBackend()` in `host-web/src/webAudioMixer.ts` implements the provider using `AudioContext`, `GainNode`, `StereoPannerNode`.

### 4. Audio channel — eliminate AudioNode exposures

After the mixer uses the provider for routing, the portable channel no longer needs to expose `AudioNode`:

- `connectAudioChannelToNode(channel, destinationNode: AudioNode)` — moves to host-web as a web-specific extension, or is replaced by the mixer provider's routing
- `getAudioChannelInputNode(): AudioNode | null` — moves to host-web
- `getAudioChannelOutputNode(): AudioNode | null` — moves to host-web
- `hasAudioChannelNodeAccess` / `hasAudioChannelFade` — moves to host-web

The `fadeAudioChannelGain` function currently uses `getAudioSourceGainNode` (returns `GainNode`) for gain scheduling. Two options:
- Add `fadeSourceGain(source, target, durationMs)` to `HostAudioDeviceProvider` so the fade is done through the provider
- Move `fadeAudioChannelGain` to host-web as a web-specific extension

Recommend adding `fadeSourceGain` to `HostAudioDeviceProvider` — fading is a standard audio operation, not web-specific. The web implementation uses `cancelScheduledValues`/`setValueAtTime`/`linearRampToValueAtTime` internally. Non-web backends implement it however they support gain ramping.

### Provider threading

Follow the established pattern: provider as first parameter. Every function that was previously self-contained now takes its provider:

- Video: `playVideoResource(hostVideo, source, options)`, `pauseVideoChannel(hostVideo, channel)`, etc.
- Mixer: `createAudioMixer(mixerProvider, device, options)`, `addAudioBusToMixer(mixerProvider, mixer, bus)`, etc.
- The audio channel already takes `HostAudioDeviceProvider` in `playAudioResource` — extend with `fadeSourceGain`.

## Constraints

- Zero `HTMLVideoElement`, `HTMLMediaElement`, `AudioContext`, `GainNode`, `StereoPannerNode`, `AudioBufferSourceNode`, `AudioNode`, `AudioBuffer` references in the portable `media` package's non-test source after this work.
- `HostVideoProvider`, `HostAudioDeviceProvider`, `HostAudioMixerProvider` interfaces in `@flighthq/types`.
- Web implementations in `host-web`.
- `createWebAudioDeviceBackend` moves from `media/` to `host-web/`.
- All callers updated — examples, `mediasession`, `sdk`.
- Run `npm run fix`, `npm run exports:check`, `npm run api:check`, `npm run packages:check` after changes.
- Run `npm run test --workspace=packages/media` and `npm run check media` before handoff.
- Run `npm run test --workspace=packages/host-web` and `npm run check host-web`.

## What stays portable

- `AudioMixer`, `AudioBus`, `AudioChannel`, `VideoChannel` entity types and their data fields
- Mixer state machine: bus name registry, active channel set, pause/resume tracking, channel-to-bus mapping
- Channel state machine: play/pause/stop/complete lifecycle, loop counting, signal emission
- `createAudioBus(options?)` — pure data, no web types
- `mediaChannelSignals.ts` — signal plumbing, no web types
- `enableAudioMixerGuards.ts` — diagnostics, no web types

## Scope

This covers the entire `@flighthq/media` package. After this work, the package's only non-ambient dependencies are `@flighthq/types`, `@flighthq/entity`, `@flighthq/math`, and `@flighthq/signals`. All browser-specific code lives in `@flighthq/host-web`.
