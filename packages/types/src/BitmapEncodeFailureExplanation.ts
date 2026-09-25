import type { ImageFormat } from './ImageFormat.ts';

export interface BitmapEncodeFailureExplanation {
  readonly format: ImageFormat;
  readonly reason: 'backend-not-installed' | 'format-unsupported';
}
