import type { Entity } from './Entity';

export interface AudioBus extends Entity {
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
export interface AudioMixer extends Entity {
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
