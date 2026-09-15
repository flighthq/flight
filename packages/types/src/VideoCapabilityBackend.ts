import type { HostImageSource } from './HostImageSource';
import type { VideoResourceLoadOptions } from './VideoResource';

export interface HostVideoProvider {
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
