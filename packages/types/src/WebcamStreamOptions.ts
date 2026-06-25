import type { WebcamFacingMode } from './WebcamFacingMode';
export interface WebcamStreamOptions {
  readonly audio?: boolean;
  readonly deviceId?: string;
  readonly facingMode?: WebcamFacingMode;
  readonly frameRate?: number;
  readonly height?: number;
  readonly width?: number;
}
