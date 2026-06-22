import type { Signal } from './Signal';

export type AudioChannelState = 'complete' | 'paused' | 'playing' | 'stopped';

export interface AudioChannel {
  currentTime: number;
  gain: number;
  length: number;
  loops: number;
  playbackRate: number;
  source: AudioResource;
  state: AudioChannelState;
  onComplete: Signal<() => void>;
}

export interface AudioPlayOptions {
  currentTime?: number;
  gain?: number;
  loops?: number;
  playbackRate?: number;
}

export interface AudioResource {
  buffer: AudioBuffer | null;
}

export interface AudioResourceUrl {
  url: string;
  type?: string;
}
