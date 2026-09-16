import type { AudioDeviceHandle, AudioSourceHandle } from './AudioDeviceHandle';
import type { Entity } from './Entity';

export type AudioBusNodeHandle = number & { readonly __brand: 'AudioBusNodeHandle' };

export type AudioMixerGraphHandle = number & { readonly __brand: 'AudioMixerGraphHandle' };

export interface HostAudioMixerCapability extends Entity {
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
