import type { Entity } from './Entity';

export interface HostAudioCodecCapability extends Entity {
  canPlayType(mimeType: string): boolean;
}
