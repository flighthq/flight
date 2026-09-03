import type {
  Bitmap,
  BitmapEncodeFailureExplanation,
  HasGraphicsBitmapEncode,
  ImageFormat,
} from '@flighthq/types/contract';

export function encodeBitmap(
  host: Readonly<HasGraphicsBitmapEncode>,
  source: Readonly<Bitmap>,
  format: ImageFormat = 'png',
  quality: number = 0.9,
): Uint8Array | null {
  const resolution = resolveBitmapEncode(host, format);
  if (resolution.reason !== null) return null;
  return resolution.backend.encodeBitmap(source, resolution.format, quality);
}

export function explainBitmapEncodeFailure(
  host: Readonly<HasGraphicsBitmapEncode>,
  format: ImageFormat,
): BitmapEncodeFailureExplanation | null {
  const resolution = resolveBitmapEncode(host, format);
  return resolution.reason === null ? null : { format: resolution.format, reason: resolution.reason };
}

type BitmapEncodeResolution =
  | {
      readonly backend: HasGraphicsBitmapEncode['graphics']['bitmapEncode'];
      readonly format: ImageFormat;
      readonly reason: null;
    }
  | {
      readonly backend: HasGraphicsBitmapEncode['graphics']['bitmapEncode'] | null;
      readonly format: ImageFormat;
      readonly reason: BitmapEncodeFailureExplanation['reason'];
    };

function resolveBitmapEncode(host: Readonly<HasGraphicsBitmapEncode>, format: ImageFormat): BitmapEncodeResolution {
  const normalizedFormat: ImageFormat = format === 'jpeg' ? 'jpeg' : 'png';
  const backend = host.graphics.bitmapEncode;
  if (!backend.supportedFormats.includes(normalizedFormat)) {
    return { backend, format: normalizedFormat, reason: 'format-unsupported' };
  }
  return { backend, format: normalizedFormat, reason: null };
}
