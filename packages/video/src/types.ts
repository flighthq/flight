import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { HostImageSource } from '@flighthq/host/contract';
import type { Signal } from '@flighthq/signals/contract';

interface VideoEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface HostVideoCapability {
  addEndedListener?(element: HostImageSource, listener: () => void): void;
  attachStream?(stream: unknown): HostImageSource | null;
  canPlayType(mimeType: string): boolean;
  createObjectUrl?(data: Blob): string;
  createVideoElement?(): HostImageSource | null;
  getCurrentTime?(element: HostImageSource): number;
  getDuration?(element: HostImageSource): number;
  getHeight?(element: HostImageSource): number;
  getLoop?(element: HostImageSource): boolean;
  getMuted?(element: HostImageSource): boolean;
  getPlaybackRate?(element: HostImageSource): number;
  getVolume?(element: HostImageSource): number;
  getWidth?(element: HostImageSource): number;
  isReady?(element: HostImageSource): boolean;
  loadUrl?(url: string, options?: Readonly<VideoResourceLoadOptions>, signal?: AbortSignal): Promise<HostImageSource>;
  pause?(element: HostImageSource): void;
  play?(element: HostImageSource): Promise<void>;
  releaseElement?(element: HostImageSource): void;
  removeEndedListener?(element: HostImageSource, listener: () => void): void;
  revokeObjectUrl?(url: string): void;
  setCurrentTime?(element: HostImageSource, value: number): void;
  setLoop?(element: HostImageSource, value: boolean): void;
  setMuted?(element: HostImageSource, value: boolean): void;
  setPlaybackRate?(element: HostImageSource, value: number): void;
  setVolume?(element: HostImageSource, value: number): void;
}

export interface HostVideoCapabilities {
  readonly playback?: HostVideoCapability;
}

export type VideoChannelState = 'complete' | 'paused' | 'playing' | 'stopped';

export interface VideoChannel {
  currentTime: number;
  gain: number;
  length: number;
  loops: number;
  // Silences output without disturbing `gain`, so unmuting restores the level the caller set.
  muted: boolean;
  playbackRate: number;
  source: VideoResource | null;
  state: VideoChannelState;
  onComplete: Signal<void>;
}

export interface VideoPlayOptions {
  currentTime?: number;
  gain?: number;
  loops?: number;
  playbackRate?: number;
}

export interface VideoResource extends VideoEntity {
  element: HostImageSource | null;
  // The object URL this resource owns, when it was loaded from a Blob; null otherwise. It is held for
  // the resource's whole life, not just its load: the element keeps fetching from this URL while it
  // plays and re-fetches on seek, so revoking it earlier breaks playback of an already-"loaded" video.
  // Ownership lives on the resource so destroyVideoResource can release it — a resource built over a
  // caller's own URL leaves this null and destruction touches nothing.
  objectUrl: string | null;
  // True when this resource created and owns the element (via createWebVideoResourceFromMediaStream or
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
