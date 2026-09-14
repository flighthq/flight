import type { HostImageSource } from './HostImageSource';
import type { VideoResourceLoadOptions } from './VideoResource';

export interface HostVideoProvider {
  attachStream?(stream: unknown): HostImageSource | null;
  canPlayType(mimeType: string): boolean;
  createObjectUrl?(data: Blob): string;
  createVideoElement?(): HostImageSource | null;
  getDuration?(element: HostImageSource): number;
  getHeight?(element: HostImageSource): number;
  getWidth?(element: HostImageSource): number;
  isReady?(element: HostImageSource): boolean;
  loadUrl?(url: string, options?: Readonly<VideoResourceLoadOptions>, signal?: AbortSignal): Promise<HostImageSource>;
  releaseElement?(element: HostImageSource): void;
  revokeObjectUrl?(url: string): void;
}
