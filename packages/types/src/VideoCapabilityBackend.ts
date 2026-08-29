import type { HostImageSource } from './HostImageSource';

export interface VideoCapabilityBackend {
  canPlayType(mimeType: string): boolean;
  createVideoElement?(): HostImageSource | null;
}

export type VideoCapabilityOperation = keyof VideoCapabilityBackend;
