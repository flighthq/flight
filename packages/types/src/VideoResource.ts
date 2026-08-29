import type { HostImageSource } from './HostImageSource';
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
  element: HostImageSource | null;
  // The object URL this resource owns, when it was loaded from a Blob; null otherwise. It is held for
  // the resource's whole life, not just its load: the element keeps fetching from this URL while it
  // plays and re-fetches on seek, so revoking it earlier breaks playback of an already-"loaded" video.
  // Ownership lives on the resource so destroyVideoResource can release it — a resource built over a
  // caller's own URL leaves this null and destruction touches nothing.
  objectUrl: string | null;
  // True when this resource created and owns the element (via createVideoResourceFromMediaStream or
  // loadVideoResourceFromUrl). False when the element was provided by the caller (createVideoResource
  // wrapping an existing element). destroyVideoResource releases the element's decoder only for owned
  // elements; a borrowed element is the caller's to manage.
  ownsElement: boolean;
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
