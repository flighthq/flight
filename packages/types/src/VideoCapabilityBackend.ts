import type { HostImageSource } from './HostImageSource';

export interface HostVideoProvider {
  canPlayType(mimeType: string): boolean;
  createVideoElement?(): HostImageSource | null;
}
