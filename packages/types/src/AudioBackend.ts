import type { Entity } from './Entity';

export interface HostAudioCapability extends Entity {
  canPlayType(mimeType: string): boolean;
}
