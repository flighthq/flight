import type { Signal } from './Signal';

export type VideoChannelState = 'complete' | 'paused' | 'playing' | 'stopped';

export interface VideoChannel {
  currentTime: number;
  gain: number;
  length: number;
  loops: number;
  playbackRate: number;
  source: VideoSource;
  state: VideoChannelState;
  onComplete: Signal<() => void>;
}

export interface VideoPlayOptions {
  currentTime?: number;
  gain?: number;
  loops?: number;
  playbackRate?: number;
}

export interface VideoSource {
  element: HTMLVideoElement | null;
}

export interface VideoSourceURL {
  url: string;
  type?: string;
}
