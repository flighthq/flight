import type { WebcamCapabilityRange } from './WebcamCapabilityRange';
import type { WebcamFacingMode } from './WebcamFacingMode';
export interface WebcamCapabilities {
  readonly exposureCompensation: Readonly<WebcamCapabilityRange> | null;
  readonly exposureModes: readonly string[];
  readonly focusDistance: Readonly<WebcamCapabilityRange> | null;
  readonly focusModes: readonly string[];
  readonly frameHeight: Readonly<WebcamCapabilityRange> | null;
  readonly frameRate: Readonly<WebcamCapabilityRange> | null;
  readonly frameWidth: Readonly<WebcamCapabilityRange> | null;
  readonly supportedFacingModes: readonly WebcamFacingMode[];
  readonly torch: boolean;
  readonly whiteBalanceModes: readonly string[];
  readonly zoom: Readonly<WebcamCapabilityRange> | null;
}
