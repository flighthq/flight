import type { Signal } from './Signal';

export type VideoChannelState = 'complete' | 'paused' | 'playing' | 'stopped';

export interface VideoChannel {
  currentTime: number;
  gain: number;
  length: number;
  loops: number;
  playbackRate: number;
  source: VideoResource;
  state: VideoChannelState;
  onComplete: Signal<() => void>;
}

export interface VideoPlayOptions {
  currentTime?: number;
  gain?: number;
  loops?: number;
  playbackRate?: number;
}

export interface VideoResource {
  element: HTMLVideoElement | null;
}

// Options threaded into the element-backed URL loaders. Omitted fields keep the loader's default
// policy (preload 'auto', resolve on 'canplay', no crossOrigin/muted/playsInline set). `crossOrigin`
// must be set before assigning the src so the decoded frames stay untainted for GPU upload.
export interface VideoResourceLoadOptions {
  crossOrigin?: string;
  muted?: boolean;
  playsInline?: boolean;
  preload?: string;
  // Which media event resolves the load: 'metadata' (dimensions/duration known), 'canplay' (enough
  // buffered to start), or 'canplaythrough' (estimated buffered to the end without stalling).
  readiness?: 'metadata' | 'canplay' | 'canplaythrough';
}

export interface VideoResourceUrl {
  url: string;
  type?: string;
}
