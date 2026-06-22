import type { RenderEffect } from './RenderEffect';

export interface ExposureEffect extends RenderEffect {
  kind: 'ExposureEffect'; // [HDR]
  exposure?: number; // stops, applied as 2^exposure. Default 0.
}
