export interface AudioBus {
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
export interface AudioMixer {
  masterGain: number;
  masterMuted: boolean;
}
export interface AudioMixerOptions {
  masterGain?: number;
  masterMuted?: boolean;
}
