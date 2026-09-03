import type { Entity } from './Entity';

export interface AudioBackend extends Entity {
  canPlayType(mimeType: string): boolean;
}
