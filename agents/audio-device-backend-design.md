# AudioDeviceBackend Design

_2026-08-28. Read-only design proposal for the installable native audio-device seam that satisfies P2 of [upstream-host-requirements](upstream-host-requirements.md)._

**Status: proposal (read-only, no implementation until scope approved).**

## Problem

`@flighthq/media` owns playback (channels, mixer, buses) but is hard-wired to the Web Audio API: `AudioContext`, `AudioBufferSourceNode`, `GainNode`, `StereoPannerNode`, `AudioBuffer`. A native host (Lime/OpenAL, Node.js, a C/C++ port) cannot replace any of these. The `AudioBackend` seam in `@flighthq/audio` covers only codec probing (`canPlayType`); everything from decoded PCM through the speaker is still web-only.

### Current web API surface in `@flighthq/media`

| Web API type | Where used | What it does |
|---|---|---|
| `AudioContext` | `playAudioResource`, `createAudioMixer` | Caller-owned device/graph factory |
| `AudioBuffer` | `AudioResource.buffer` | Decoded PCM data |
| `AudioBufferSourceNode` | `startAudioChannel` | One-shot playback node |
| `GainNode` | `startAudioChannel`, `addAudioBusToMixer` | Volume control |
| `StereoPannerNode` | `addAudioBusToMixer` | Stereo panning |
| `AudioNode` | `connectAudioChannelToNode` | Generic graph connection |

### Current web API surface in `@flighthq/audio`

| Web API type | Where used | What it does |
|---|---|---|
| `AudioContext` | `loadAudioResource*` functions | Caller-provided decoder (`decodeAudioData`) |
| `AudioBuffer` | `AudioResource.buffer`, `createAudioResourceFromSamples` | Decoded PCM storage |
| `Audio` (HTMLMediaElement) | `createWebAudioBackend` (behind seam) | Format capability probing |

## Design

### Principle: opaque handles, not web types

The backend exposes opaque numeric handles for device, source, and bus. The implementation maps these to whatever the platform provides (Web Audio nodes, OpenAL sources/buffers, native handles). Flight's `media` functions operate on handles through the backend; no web type appears in the public API.

### AudioDeviceBackend interface

```typescript
// @flighthq/types

interface AudioDeviceBackend {
  // -- Device lifecycle --
  createDevice(sampleRate: number): number;
  destroyDevice(device: number): void;
  resumeDevice(device: number): void;
  suspendDevice(device: number): void;
  getDeviceTime(device: number): number;

  // -- Decoded buffer management --
  createBuffer(device: number, channels: number, length: number, sampleRate: number): number;
  setBufferChannelData(buffer: number, channel: number, data: Float32Array): void;
  getBufferDuration(buffer: number): number;
  destroyBuffer(buffer: number): void;

  // -- Source playback --
  createSource(device: number, buffer: number): number;
  destroySource(source: number): void;
  startSource(source: number, offset: number): void;
  stopSource(source: number): void;
  getSourceState(source: number): 'playing' | 'stopped';
  setSourceGain(source: number, gain: number): void;
  setSourcePlaybackRate(source: number, rate: number): void;
  setSourceLoop(source: number, loop: boolean): void;
  onSourceEnded(source: number, callback: (() => void) | null): void;

  // -- Bus/routing --
  createBus(device: number): number;
  destroyBus(device: number, bus: number): void;
  setBusGain(bus: number, gain: number): void;
  setBusPan(bus: number, pan: number): void;
  connectSourceToBus(source: number, bus: number): void;
  connectBusToDevice(bus: number, device: number): void;

  // -- Volume fade --
  fadeGain(bus: number, targetGain: number, durationMs: number): void;

  // -- Spatial (3D) positioning --
  setSourcePosition(source: number, x: number, y: number, z: number): void;
  setListenerPosition(device: number, x: number, y: number, z: number): void;
  setListenerOrientation(
    device: number,
    forwardX: number, forwardY: number, forwardZ: number,
    upX: number, upY: number, upZ: number,
  ): void;

  // -- Decode --
  decodeAudioData(device: number, data: ArrayBuffer): Promise<number>;
}
```

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

Sentinel: every method is a no-op or returns a sentinel value (`-1` for handles, `0` for durations, `'stopped'` for state).

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
@flighthq/types          ← AudioDeviceBackend interface
    ↑
@flighthq/audio          ← codec probing (AudioBackend), resource loading
    ↑                       decodeAudioData moves behind AudioDeviceBackend
@flighthq/media          ← playback, mixer, bus (AudioDeviceBackend consumer)
                            process-global get/set/install/explain
@flighthq/host-web       ← enableHostWebAudioDevice() (web impl)
    ↑
@flighthq/application    ← (no dependency — zero coupling preserved)
```

`media` depends on `audio` (for `AudioResource`) and `types` (for the interface). `audio` depends on `types`. `host-web` depends on `media` (for `createWebAudioDeviceBackend` and `installAudioDeviceHostBackend`). Nothing depends on `application`.

## Migration surface

### Type changes

| Type | Current | After |
|---|---|---|
| `AudioResource.buffer` | `AudioBuffer \| null` | `number \| null` (opaque buffer handle) |
| `AudioChannel` (runtime) | `WeakMap<AudioChannel, {context, gainNode, sourceNode, ...}>` | `WeakMap<AudioChannel, {device, sourceHandle, busHandle}>` |
| `AudioMixer` (runtime) | `WeakMap<AudioMixer, {context, masterGainNode, busGainNodes, ...}>` | `WeakMap<AudioMixer, {device, masterBusHandle, busHandles}>` |
| `playAudioResource` param | `context: AudioContext` | `device: number` |
| `createAudioMixer` param | `context: AudioContext` | `device: number` |

### Function changes in `@flighthq/media`

| Function | Change |
|---|---|
| `playAudioResource(context, source, options?)` | `context: AudioContext` → `device: number` |
| `createAudioMixer(context, options?)` | `context: AudioContext` → `device: number` |
| `startAudioChannel` (internal) | Replace `context.createBufferSource()` → `backend.createSource(device, buffer)` |
| `addAudioBusToMixer` | Replace `context.createGain()`, `context.createStereoPanner()` → `backend.createBus(device)` |
| `fadeAudioChannelGain` | Replace `gainNode.gain.linearRampToValueAtTime` → `backend.fadeGain(bus, target, duration)` |
| `connectAudioChannelToNode` | Replace `gainNode.connect(destination)` → `backend.connectSourceToBus(source, bus)` |
| `destroyAudioMixer` | Replace `gainNode.disconnect()` → `backend.destroyBus(device, bus)` |

### Function changes in `@flighthq/audio`

| Function | Change |
|---|---|
| `loadAudioResourceFromBytes` | Replace `context.decodeAudioData(arrayBuffer)` → `backend.decodeAudioData(device, arrayBuffer)` |
| `loadAudioResourceFromUrl` | Same decode path |
| `createAudioResourceFromSamples` | Replace `new AudioBuffer({...})` → `backend.createBuffer(device, channels, length, sampleRate)` + `backend.setBufferChannelData(buffer, ch, data)` |

All `loadAudioResource*` functions currently take `context: AudioContext` as their first parameter. These become `device: number`.

### Web backend implementation sketch

`createWebAudioDeviceBackend()` maps handles to Web Audio objects:

- `createDevice(sampleRate)` → `new AudioContext({sampleRate})`, returns handle
- `createBuffer(device, channels, length, sampleRate)` → `new AudioBuffer({...})`, returns handle
- `createSource(device, buffer)` → `context.createBufferSource()`, sets `.buffer`, returns handle
- `startSource(source, offset)` → `sourceNode.start(0, offset)`
- `createBus(device)` → `context.createGain()` + optional `context.createStereoPanner()`
- `decodeAudioData(device, data)` → `context.decodeAudioData(data)`, stores result, returns handle

Handle allocation: monotonic counter, `Map<number, NativeObject>` per type. `destroy*` deletes from map and calls `.disconnect()` / `.close()` as needed.

### Native backend implementation (Lime/OpenAL sketch)

- `createDevice` → `alcOpenDevice` + `alcCreateContext`
- `createBuffer` → `alGenBuffers` + `alBufferData`
- `createSource` → `alGenSources` + `alSourcei(source, AL_BUFFER, buffer)`
- `startSource` → `alSourcePlay`
- `setSourceGain` → `alSourcef(source, AL_GAIN, gain)`
- `setSourcePosition` → `alSource3f(source, AL_POSITION, x, y, z)`
- `decodeAudioData` → host-side codec (Lime's `AudioBuffer.fromBytes`)

## Scope boundaries

### In scope

- `AudioDeviceBackend` interface in `@flighthq/types`
- Process-global plumbing in `@flighthq/media`
- Web backend in `@flighthq/host-web` (`createWebAudioDeviceBackend`, `enableHostWebAudioDevice`)
- Migration of `@flighthq/media` audioChannel.ts and audioMixer.ts to use the backend
- Migration of `@flighthq/audio` decode/load functions to use the backend
- `AudioResource.buffer` type change from `AudioBuffer` to `number` (opaque handle)

### Out of scope (future work)

- Streaming audio (progressive decode, media-source extensions) — separate `AudioStreamBackend` or extension
- Audio worklets / custom DSP nodes — not portable, not part of this seam
- MIDI — different protocol, different backend
- Video audio track routing — `@flighthq/video` concern
- `MediaSession` integration — already in `@flighthq/mediasession`, orthogonal

## Relationship to existing `AudioBackend`

The existing `AudioBackend` in `@flighthq/audio` covers codec probing (`canPlayType`). It stays: probing "can the runtime decode this MIME type?" is a distinct question from "play this decoded buffer." The two backends are complementary:

- `AudioBackend` (in `@flighthq/audio`) — "can you decode this format?" (codec query)
- `AudioDeviceBackend` (in `@flighthq/media`) — "play/mix/route this decoded audio" (device operations)

A native host installs both: `AudioBackend` for its codec capabilities, `AudioDeviceBackend` for its audio device.
