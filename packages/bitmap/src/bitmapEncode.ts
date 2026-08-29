import type {
  Bitmap,
  BitmapEncodeBackend,
  BitmapEncodeFailureExplanation,
  ImageFormat,
} from '@flighthq/types/contract';

import { getBitmapEncodeBackend } from './bitmapEncodeBackend';

export function encodeBitmap(
  source: Readonly<Bitmap>,
  format: ImageFormat = 'png',
  quality: number = 0.9,
): Uint8Array | null {
  const resolution = resolveBitmapEncode(format);
  if (resolution.reason !== null) return null;
  return resolution.backend.encodeBitmap(source, resolution.format, quality);
}

export function explainBitmapEncodeFailure(format: ImageFormat): BitmapEncodeFailureExplanation | null {
  const resolution = resolveBitmapEncode(format);
  return resolution.reason === null ? null : { format: resolution.format, reason: resolution.reason };
}

type BitmapEncodeResolution =
  | {
      readonly backend: BitmapEncodeBackend;
      readonly format: ImageFormat;
      readonly reason: null;
    }
  | {
      readonly backend: BitmapEncodeBackend | null;
      readonly format: ImageFormat;
      readonly reason: BitmapEncodeFailureExplanation['reason'];
    };

function resolveBitmapEncode(format: ImageFormat): BitmapEncodeResolution {
  // ImageFormat is currently the closed jpeg | png pair. Adding a third member makes this defensive
  // runtime fallback a defect: extend the mapping explicitly instead of silently encoding it as PNG.
  const normalizedFormat: ImageFormat = format === 'jpeg' ? 'jpeg' : 'png';
  const backend = getBitmapEncodeBackend();
  if (backend === null) return { backend, format: normalizedFormat, reason: 'backend-not-installed' };
  if (!backend.supportedFormats.includes(normalizedFormat)) {
    return { backend, format: normalizedFormat, reason: 'format-unsupported' };
  }
  return { backend, format: normalizedFormat, reason: null };
}
