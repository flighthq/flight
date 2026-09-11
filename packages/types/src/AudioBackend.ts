import type { Entity } from './Entity';

export interface HostAudioProvider extends Entity {
  canPlayType(mimeType: string): boolean;
}
