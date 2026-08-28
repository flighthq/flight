# AudioDeviceBackend Design

_2026-08-28. Design record for the installable native audio-device seam that satisfies P2 of [upstream-host-requirements](upstream-host-requirements.md)._

**Status: P2 satisfied — native hosts have playback without mixing.** 13 core operations implemented (device lifecycle, buffer management, source playback). Bus routing, spatial positioning, and panning are user-decided deferrals to Option B, not open gaps: the mixer continues to operate directly on Web Audio nodes, and a native host that needs mixing would extend through a dedicated bus backend or Option B operations.

### Principle: abstraction adds host participation, never levels capable hosts down

When a capability moves behind a backend seam, the web implementation must preserve every feature the web platform provides. Opaque handles replace web types in the portable API, but web-only features (gain automation, graph routing, native node access) remain available through web-specific backend extensions. A native backend declares those web-only capabilities absent through the explain/has machinery — it never pretends they exist by returning no-ops or null.

## Problem

`@flighthq/media` owns playback (channels, mixer, buses) but is hard-wired to the Web Audio API: `AudioContext`, `AudioBufferSourceNode`, `GainNode`, `StereoPannerNode`, `AudioBuffer`. A native host (Lime/OpenAL, Node.js, a C/C++ port) cannot replace any of these. The `AudioBackend` seam in `@flighthq/audio` covers only codec probing (`canPlayType`); everything from decoded PCM through the speaker is still web-only.

Decoding stays in `@flighthq/audio`. The device backend covers only what happens after PCM data is available: buffer upload, source playback, bus routing, and spatial positioning.

### Current web API surface in `@flighthq/media`

| Web API type | Where used | What it does |
|---|---|---|
| `AudioContext` | `playAudioResource`, `createAudioMixer` | Caller-owned device/graph factory |
| `AudioBuffer` | `AudioResource.buffer` | Decoded PCM data |
| `AudioBufferSourceNode` | `startAudioChannel` | One-shot playback node |
| `GainNode` | `startAudioChannel`, `addAudioBusToMixer` | Volume control |
| `StereoPannerNode` | `addAudioBusToMixer` | Stereo panning |
| `AudioNode` | `connectAudioChannelToNode` | Generic graph connection |

### Current web API surface in `@flighthq/audio` (unchanged by this design)

| Web API type | Where used | What it does |
|---|---|---|
| `AudioContext` | `loadAudioResource*` functions | Caller-provided decoder (`decodeAudioData`) |
| `AudioBuffer` | `AudioResource.buffer`, `createAudioResourceFromSamples` | Decoded PCM storage |
| `Audio` (HTMLMediaElement) | `createWebAudioBackend` (behind seam) | Format capability probing |

## Design

### Principle: branded handles, not web types

The backend exposes branded handle types for device, buffer, source, and bus. Each is a zero-runtime branded `number` that compiles away but provides type safety at the TypeScript level. The implementation maps handles to whatever the platform provides (Web Audio nodes, OpenAL sources/buffers, native handles). Flight's `media` functions operate on handles through the backend; no web type appears in the public API.

### Handle types

```typescript
// @flighthq/types

export type AudioDeviceHandle = number & { readonly __brand: 'AudioDeviceHandle' };
export type AudioBufferHandle = number & { readonly __brand: 'AudioBufferHandle' };
export type AudioSourceHandle = number & { readonly __brand: 'AudioSourceHandle' };
export type AudioBusHandle = number & { readonly __brand: 'AudioBusHandle' };
```

### AudioDeviceBackend interface (13 operations — implemented)

```typescript
// @flighthq/types

interface AudioDeviceBackend {
  // -- Device lifecycle (4) --
  createDevice(sampleRate: number): AudioDeviceHandle;
  destroyDevice(device: AudioDeviceHandle): void;
  getDeviceTime(device: AudioDeviceHandle): number;
  resumeDevice(device: AudioDeviceHandle): void;

  // -- Buffer management (2) --
  createBuffer(
    device: AudioDeviceHandle,
    channels: number,
    length: number,
    sampleRate: number,
    data: readonly Float32Array[],
  ): AudioBufferHandle;
  destroyBuffer(buffer: AudioBufferHandle): void;

  // -- Source playback (7) --
  createSource(device: AudioDeviceHandle, buffer: AudioBufferHandle): AudioSourceHandle;
  destroySource(source: AudioSourceHandle): void;
  onSourceEnded(source: AudioSourceHandle, callback: (() => void) | null): void;
  setSourceGain(source: AudioSourceHandle, gain: number): void;
  setSourcePlaybackRate(source: AudioSourceHandle, rate: number): void;
  startSource(source: AudioSourceHandle, offset: number): void;
  stopSource(source: AudioSourceHandle): void;
}
```

### Web-specific extensions (not AudioDeviceBackend operations)

The web backend returns an object that satisfies `AudioDeviceBackend` and additionally provides:

- `getSourceGainNode(source): GainNode | null` — the GainNode for a source handle
- `getSourceBufferSourceNode(source): AudioBufferSourceNode | null` — the active BufferSourceNode

These are queried through `getAudioSourceGainNode` and `getAudioSourceBufferSourceNode` in `audioDeviceBackend.ts`, which check the active backend via type guard. `hasAudioDeviceWebNodeAccess()` reports whether the current backend exposes these methods.

Channel-level web-only capabilities (`connectAudioChannelToNode`, `getAudioChannelInputNode`, `getAudioChannelOutputNode`, `fadeAudioChannelGain` with gain automation) work when the web backend is active and return sentinels otherwise. `hasAudioChannelNodeAccess()` and `hasAudioChannelFade()` report availability.

### Intentionally absent operations (Option A scope boundary)

The following operations appear in the original design proposal but are absent from `AudioDeviceBackend` because Option A scopes them out, not by omission.

**Bus operations** (`createBus`, `destroyBus`, `connectSourceToBus`, `connectBusToDevice`, `setBusGain`, `setBusPan`): The mixer (`audioMixer.ts`) uses `AudioContext` and Web Audio nodes directly. Bus routing is inherently web-only via the mixer's `GainNode`/`StereoPannerNode` graph. Option A does not abstract bus topology into the backend; a native host that needs bus routing would extend through Option B or a dedicated bus backend.

**Spatial operations** (`setListenerOrientation`, `setListenerPosition`, `setSourcePosition`): Spatial audio (3D positioning, HRTF) is outside the channel/mixer playback scope. It would require a `PannerNode` or spatial listener, which are web-specific. Option A covers decoded-PCM-to-speaker; spatial positioning is deferred to Option B.

**Pan** (`setBusPan`): Panning is implemented at the mixer level via `StereoPannerNode`, which is web-only. The backend does not abstract pan because the mixer owns panning as a bus feature, not a source feature.

**Node routing on native** (`getSourceGainNode`, `getSourceBufferSourceNode`): Not `AudioDeviceBackend` operations by design. They are web-specific extension methods on the object returned by `createWebAudioDeviceBackend()`. A native backend never exposes them. `hasAudioDeviceWebNodeAccess()` / `hasAudioChannelNodeAccess()` return false, declaring the capability absent through P1 machinery — not a no-op.

**Additional source/buffer queries** (`getSourceState`, `setSourceLoop`, `getBufferDuration`, `setBufferChannelData`, `suspendDevice`): The channel layer tracks its own state, loop count, and duration from `AudioResource`. The backend does not need to report these back. `suspendDevice` is omitted because the current pattern only uses `resumeDevice` (autoplay unlock); suspension is caller-managed.

**`AudioBusHandle`**: Does not exist in `@flighthq/types`. Only referenced here as a deferred concept.

### Sentinel and invalid-handle behavior

The sentinel backend and every operation on an invalid (destroyed or never-created) handle follow the same contract: **no-op for void operations, sentinel return for value operations.** No operation throws on an invalid handle.

| Operation | Invalid-handle return |
|---|---|
| `createDevice` | Sentinel `AudioDeviceHandle` (backend-defined) |
| `destroyDevice` | No-op |
| `getDeviceTime` | `0` |
| `resumeDevice` | No-op |
| `suspendDevice` | No-op |
| `createBuffer` | Sentinel `AudioBufferHandle` |
| `destroyBuffer` | No-op |
| `getBufferDuration` | `0` |
| `setBufferChannelData` | No-op |
| `createSource` | Sentinel `AudioSourceHandle` |
| `destroySource` | No-op (clears `onSourceEnded` exactly once; see below) |
| `getSourceState` | `'stopped'` |
| `onSourceEnded` | No-op |
| `setSourceGain` | No-op |
| `setSourceLoop` | No-op |
| `setSourcePlaybackRate` | No-op |
| `startSource` | No-op |
| `stopSource` | No-op |
| `createBus` | Sentinel `AudioBusHandle` |
| `destroyBus` | No-op |
| `connectBusToDevice` | No-op |
| `connectSourceToBus` | No-op |
| `fadeGain` | No-op |
| `setBusGain` | No-op |
| `setBusPan` | No-op |
| `setListenerOrientation` | No-op |
| `setListenerPosition` | No-op |
| `setSourcePosition` | No-op |

### `destroySource` callback contract

`destroySource(source)` clears the `onSourceEnded` callback exactly once: it nulls the registered callback without firing it, stops the source if playing, and releases the handle. After `destroySource`:

- The `onSourceEnded` callback does **not** fire (destroy is an explicit teardown, not a playback completion).
- Any subsequent operation on the destroyed handle is a no-op per the invalid-handle table.
- The handle value may be reused by a future `createSource` call.

### Buffer handle ownership

The acquirer releases: `playAudioResource` creates the buffer handle, and `destroyAudioChannel` frees it via `destroyBuffer`. Borrowed handles (passed to `createSource`) are never destroyed by the borrower — the source references the buffer but does not own it.

- Stopping or pausing a channel does not free the buffer (the channel may resume).
- Completing playback does not free the buffer (the channel may be replayed).
- `destroyAudioChannel` stops the active source, then frees the buffer, then clears the runtime.
- Double-destroy is safe (the runtime is cleared on first call; the second is a no-op).

Tests cover: explicit teardown frees the buffer, stop/complete do not free, double-destroy is safe.

### Process-global plumbing

Follows the existing platform integration suite pattern exactly:

```
@flighthq/media/contract:
  getAudioDeviceBackend(): AudioDeviceBackend
  setAudioDeviceBackend(backend: AudioDeviceBackend | null): void
  installAudioDeviceHostBackend(backend: AudioDeviceBackend): void
  explainAudioDeviceBackend(): BackendExplanation
  observeAudioDeviceHostResult(operation: string, succeeded: boolean): void
  resetAudioDeviceBackendForTest(): void
  createWebAudioDeviceBackend(): AudioDeviceBackend

@flighthq/host-web:
  enableHostWebAudioDevice(): void     // called by enableHostWeb()
  resetHostWebAudioDeviceForTest(): void
```

Three-tier precedence: custom (`setAudioDeviceBackend`) > host (`enableHostWebAudioDevice`) > sentinel.

Sentinel: every method follows the invalid-handle table above — no-ops and sentinel returns.

### Zero Application dependency

The `AudioDeviceBackend` and its plumbing live in `@flighthq/media`, not in `@flighthq/application`. No import of `Application` or `@flighthq/application` exists or is introduced. The device handle replaces the caller-provided `AudioContext`; the caller still creates and owns the device lifetime:

```typescript
// Before (web-only):
const context = new AudioContext();
const channel = playAudioResource(context, resource);

// After:
const device = getAudioDeviceBackend().createDevice(44100);
const channel = playAudioResource(device, resource);
```

## Dependency direction

```
@flighthq/types          ← AudioDeviceBackend interface + branded handle types
    ↑
@flighthq/audio          ← codec probing (AudioBackend), resource loading
    ↑                       decode stays here (AudioContext parameter unchanged)
@flighthq/media          ← playback, mixer, bus (AudioDeviceBackend consumer)
                            process-global get/set/install/explain
@flighthq/host-web       ← enableHostWebAudioDevice() (web impl)
    ↑
@flighthq/application    ← (no dependency — zero coupling preserved)
```

`media` depends on `audio` (for `AudioResource`) and `types` (for the interface and handle types). `audio` depends on `types`. `host-web` depends on `media` (for `createWebAudioDeviceBackend` and `installAudioDeviceHostBackend`). Nothing depends on `application`.

Decoding (`loadAudioResource*`, `createAudioResourceFromSamples`) stays in `@flighthq/audio` with its existing `AudioContext` parameter. The device backend does not own or replace the decode path — it receives already-decoded PCM via `createBuffer`.

## Migration surface

### Type changes

| Type | Current | After |
|---|---|---|
| `AudioResource.buffer` | `AudioBuffer \| null` | `AudioBufferHandle \| null` |
| `AudioChannel` (runtime) | `WeakMap<AudioChannel, {context, gainNode, sourceNode, ...}>` | `WeakMap<AudioChannel, {device, sourceHandle, busHandle}>` |
| `AudioMixer` (runtime) | `WeakMap<AudioMixer, {context, masterGainNode, busGainNodes, ...}>` | `WeakMap<AudioMixer, {device, masterBusHandle, busHandles}>` |
| `playAudioResource` param | `context: AudioContext` | `device: AudioDeviceHandle` |
| `createAudioMixer` param | `context: AudioContext` | `device: AudioDeviceHandle` |

### Function changes in `@flighthq/media`

| Function | Change |
|---|---|
| `playAudioResource(context, source, options?)` | `context: AudioContext` → `device: AudioDeviceHandle` |
| `createAudioMixer(context, options?)` | `context: AudioContext` → `device: AudioDeviceHandle` |
| `startAudioChannel` (internal) | Replace `context.createBufferSource()` → `backend.createSource(device, buffer)` |
| `addAudioBusToMixer` | Replace `context.createGain()`, `context.createStereoPanner()` → `backend.createBus(device)` |
| `fadeAudioChannelGain` | Replace `gainNode.gain.linearRampToValueAtTime` → `backend.fadeGain(bus, target, duration)` |
| `connectAudioChannelToNode` | Replace `gainNode.connect(destination)` → `backend.connectSourceToBus(source, bus)` |
| `destroyAudioMixer` | Replace `gainNode.disconnect()` → `backend.destroyBus(device, bus)` |

### Function changes in `@flighthq/audio`

| Function | Change |
|---|---|
| `createAudioResourceFromSamples` | Replace `new AudioBuffer({...})` → `backend.createBuffer(device, channels, length, sampleRate, data)` |

`loadAudioResource*` functions keep their `AudioContext` parameter for decoding. The resulting `AudioBuffer` is uploaded to the device backend via `createBuffer` at the media layer (in `playAudioResource`), not in the audio layer.

### Web backend implementation sketch

`createWebAudioDeviceBackend()` maps handles to Web Audio objects:

- `createDevice(sampleRate)` → `new AudioContext({sampleRate})`, returns handle
- `createBuffer(device, channels, length, sampleRate, data)` → `new AudioBuffer({...})` + `copyToChannel`, returns handle
- `createSource(device, buffer)` → `context.createBufferSource()`, sets `.buffer`, returns handle
- `startSource(source, offset)` → `sourceNode.start(0, offset)`
- `createBus(device)` → `context.createGain()` + optional `context.createStereoPanner()`
- `destroySource(source)` → nulls `sourceNode.onended`, calls `sourceNode.stop()` if playing, deletes from map

Handle allocation: monotonic counter, `Map<number, NativeObject>` per type. `destroy*` deletes from map and calls `.disconnect()` / `.close()` as needed.

### Native backend implementation (Lime/OpenAL sketch)

- `createDevice` → `alcOpenDevice` + `alcCreateContext`
- `createBuffer` → `alGenBuffers` + `alBufferData` (interleaves Float32Array channels)
- `createSource` → `alGenSources` + `alSourcei(source, AL_BUFFER, buffer)`
- `startSource` → `alSourcePlay`
- `setSourceGain` → `alSourcef(source, AL_GAIN, gain)`
- `setSourcePosition` → `alSource3f(source, AL_POSITION, x, y, z)`

## Scope boundaries

### In scope

- `AudioDeviceBackend` interface and branded handle types in `@flighthq/types`
- Process-global plumbing in `@flighthq/media`
- Web backend in `@flighthq/host-web` (`createWebAudioDeviceBackend`, `enableHostWebAudioDevice`)
- Migration of `@flighthq/media` audioChannel.ts and audioMixer.ts to use the backend
- `AudioResource.buffer` type change from `AudioBuffer` to `AudioBufferHandle`

### Out of scope

- **Decoding** — stays in `@flighthq/audio` with `AudioContext` parameter; not part of the device backend
- Streaming audio (progressive decode, media-source extensions)
- Audio worklets / custom DSP nodes — not portable
- MIDI — different protocol, different backend
- Video audio track routing — `@flighthq/video` concern
- `MediaSession` integration — already in `@flighthq/mediasession`, orthogonal

## Relationship to existing `AudioBackend`

The existing `AudioBackend` in `@flighthq/audio` covers codec probing (`canPlayType`). It stays: probing "can the runtime decode this MIME type?" is a distinct question from "play this decoded buffer." The two backends are complementary:

- `AudioBackend` (in `@flighthq/audio`) — "can you decode this format?" (codec query)
- `AudioDeviceBackend` (in `@flighthq/media`) — "play/mix/route this decoded audio" (device operations)

A native host installs both: `AudioBackend` for its codec capabilities, `AudioDeviceBackend` for its audio device.
