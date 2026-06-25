import type { Entity } from './Entity';
import type { WebcamFacingMode } from './WebcamFacingMode';
export interface WebcamStream extends Entity {
  readonly active: boolean;
  readonly deviceId: string;
  readonly facingMode: WebcamFacingMode | null;
  readonly frameRate: number;
  readonly height: number;
  readonly id: string;
  readonly width: number;
}
