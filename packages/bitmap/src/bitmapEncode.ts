import type {
  Bitmap,
  BitmapEncodeFailureExplanation,
  HostBitmapEncodeCapability,
  ImageFormat,
} from '@flighthq/types/contract';

export function encodeBitmap(
  hostBitmapEncode: Readonly<HostBitmapEncodeCapability>,
  source: Readonly<Bitmap>,
  format: ImageFormat = 'png',
  quality: number = 0.9,
): Uint8Array | null {
  const resolution = resolveBitmapEncode(hostBitmapEncode, format);
  if (resolution.reason !== null) return null;
  return resolution.hostBitmapEncode.encodeBitmap(source, resolution.format, quality);
}

export function explainBitmapEncodeFailure(
  hostBitmapEncode: Readonly<HostBitmapEncodeCapability>,
  format: ImageFormat,
): BitmapEncodeFailureExplanation | null {
  const resolution = resolveBitmapEncode(hostBitmapEncode, format);
  return resolution.reason === null ? null : { format: resolution.format, reason: resolution.reason };
}

type BitmapEncodeResolution =
  | {
      readonly hostBitmapEncode: Readonly<HostBitmapEncodeCapability>;
      readonly format: ImageFormat;
      readonly reason: null;
    }
  | {
      readonly hostBitmapEncode: Readonly<HostBitmapEncodeCapability> | null;
      readonly format: ImageFormat;
      readonly reason: BitmapEncodeFailureExplanation['reason'];
    };

function resolveBitmapEncode(
  hostBitmapEncode: Readonly<HostBitmapEncodeCapability>,
  format: ImageFormat,
): BitmapEncodeResolution {
  const normalizedFormat: ImageFormat = format === 'jpeg' ? 'jpeg' : 'png';
  if (!hostBitmapEncode.supportedFormats.includes(normalizedFormat)) {
    return { hostBitmapEncode, format: normalizedFormat, reason: 'format-unsupported' };
  }
  return { hostBitmapEncode, format: normalizedFormat, reason: null };
}
