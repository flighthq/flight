import type { WebcamFacingMode } from './WebcamFacingMode';
export interface WebcamDevice {
  readonly deviceId: string;
  readonly facingMode: WebcamFacingMode | null;
  readonly kind: 'audio' | 'video';
  readonly label: string;
}
