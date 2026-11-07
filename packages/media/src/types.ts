// The media-owned contracts: host audio capabilities (crates/flight-media), audio channels, buses
// and the mixer, and per-channel media signals.

import type { AudioChannelState, AudioResource, HostAudioCodecCapability } from '@flighthq/audio/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type {
  AudioBufferHandle,
  AudioBusNodeHandle,
  AudioDeviceHandle,
  AudioMixerGraphHandle,
  AudioSourceHandle,
} from '@flighthq/host/contract';
import type { Signal } from '@flighthq/signals/contract';

interface MediaEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface HostAudioDeviceCapability {
  createBuffer(
    device: AudioDeviceHandle,
    channels: number,
    length: number,
    sampleRate: number,
    data: readonly Float32Array[],
  ): AudioBufferHandle;
  createDevice(sampleRate: number): AudioDeviceHandle;
  createSource(device: AudioDeviceHandle, buffer: AudioBufferHandle): AudioSourceHandle;
  destroyBuffer(buffer: AudioBufferHandle): void;
  destroyDevice(device: AudioDeviceHandle): void;
  destroySource(source: AudioSourceHandle): void;
  /**
   * Ramps a source's gain to `targetGain` over `durationMs`, cancelling any ramp already scheduled on
   * it and starting from the value in effect now.
   *
   * Optional, because scheduling is a capability a host either has or does not: one that cannot
   * schedule omits this, and the caller falls back to `setSourceGain`, so a fade still lands — it just
   * lands instantly rather than over time. Duration is milliseconds to match the authoring verbs;
   * converting to whatever clock the host schedules on is the host's job, not the caller's.
   */
  fadeSourceGain?(source: AudioSourceHandle, targetGain: number, durationMs: number): void;
  getDeviceTime(device: AudioDeviceHandle): number;
  onSourceEnded(source: AudioSourceHandle, callback: (() => void) | null): void;
  resumeDevice(device: AudioDeviceHandle): void;
  setSourceGain(source: AudioSourceHandle, gain: number): void;
  // Stereo placement in -1..1. A backend with no stereo stage implements it as a no-op rather than
  // refusing, so a caller never has to ask whether panning is available before setting it.
  setSourcePan(source: AudioSourceHandle, pan: number): void;
  setSourcePlaybackRate(source: AudioSourceHandle, rate: number): void;
  // `duration` bounds one playback pass in seconds; 0 or less plays to the end of the buffer. A loop
  // region is expressed this way rather than through the node's own loop flag, because the node's loop
  // never ends and the channel counts its loops by restarting on end.
  startSource(source: AudioSourceHandle, offset: number, duration: number): void;
  stopSource(source: AudioSourceHandle): void;
}

// The operation names only. HostAudioDeviceCapability is an Entity, so a bare `keyof` would also yield the
// runtime slot's symbol — which names no operation, and widening this union to include it makes every
// explain*/has* consumer accept a key it can never resolve.
export type AudioDeviceOperation = Exclude<keyof HostAudioDeviceCapability, keyof MediaEntity>;

export interface HostAudioMixerCapability {
  createMixerGraph(device: AudioDeviceHandle, masterGain: number): AudioMixerGraphHandle;
  destroyMixerGraph(graph: AudioMixerGraphHandle): void;
  createBusNode(graph: AudioMixerGraphHandle, gain: number, pan: number): AudioBusNodeHandle;
  destroyBusNode(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle): void;
  setBusNodeGain(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, gain: number): void;
  setBusNodePan(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, pan: number): void;
  fadeBusNodeGain(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, target: number, durationMs: number): void;
  setMasterGain(graph: AudioMixerGraphHandle, gain: number): void;
  routeSourceToBus(graph: AudioMixerGraphHandle, source: AudioSourceHandle, bus: AudioBusNodeHandle): void;
  unrouteSource(graph: AudioMixerGraphHandle, source: AudioSourceHandle): void;
  routeSourceToDefault(graph: AudioMixerGraphHandle, source: AudioSourceHandle): void;
}

export interface HostAudioCapabilities {
  readonly codec?: HostAudioCodecCapability;
  readonly device?: HostAudioDeviceCapability;
  readonly mixer?: HostAudioMixerCapability;
}

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

export interface AudioBus extends MediaEntity {
  gain: number;
  muted: boolean;
  name: string;
  pan: number;
}
export interface AudioBusOptions {
  gain?: number;
  muted?: boolean;
  name?: string;
  pan?: number;
}
export interface AudioMixer extends MediaEntity {
  masterGain: number;
  masterMuted: boolean;
}
export interface AudioMixerOptions {
  masterGain?: number;
  masterMuted?: boolean;
}

// Which bus property a write targeted when it could not reach any audio node.
export type AudioBusMixerOperation = 'gain' | 'mute' | 'pan';

// Reports a bus-property write that reached no mixer, and therefore changed nothing audible. Installed by
// `enableAudioMixerGuards` in @flighthq/media through that package's `setAudioBusMixerGuard` seam; a null
// slot is the production default.
export type AudioBusMixerGuard = (operation: AudioBusMixerOperation, bus: Readonly<AudioBus>) => void;

export type MediaReadyState = 'buffering' | 'error' | 'idle' | 'ready';
// Opt-in notification for one media channel, enabled per channel through enableAudioChannelSignals /
// enableVideoChannelSignals so a caller that never asks pays nothing.
//
// The playback-lifecycle half — complete, loop, pause, play, stop — is produced by the channel's own
// state machine. The readiness half — buffering, error, ready, seeked — describes transport state that
// only a backend or a DOM element can report; those are declared here and are NOT yet produced for
// audio, which has no such seam.
export interface MediaChannelSignals {
  onBuffering: Signal<void>;
  // Fires when a channel finishes its last pass. The channel's own `onComplete` still fires too; this
  // one exists so a caller that opted into signals reads every lifecycle event from one place.
  onComplete: Signal<void>;
  onError: Signal<string>;
  // Fires once per loop iteration, after the count is spent and before the next pass starts.
  onLoop: Signal<void>;
  onPause: Signal<void>;
  // Fires when a caller starts or resumes playback — not on a loop iteration or a seek restart.
  onPlay: Signal<void>;
  onReady: Signal<void>;
  onSeeked: Signal<void>;
  onStop: Signal<void>;
}
