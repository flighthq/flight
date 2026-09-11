import type {
  Bitmap,
  BitmapEncodeFailureExplanation,
  HostBitmapEncodeProvider,
  ImageFormat,
} from '@flighthq/types/contract';

export function encodeBitmap(
  hostBitmapEncode: Readonly<HostBitmapEncodeProvider>,
  source: Readonly<Bitmap>,
  format: ImageFormat = 'png',
  quality: number = 0.9,
): Uint8Array | null {
  const resolution = resolveBitmapEncode(hostBitmapEncode, format);
  if (resolution.reason !== null) return null;
  return resolution.backend.encodeBitmap(source, resolution.format, quality);
}

export function explainBitmapEncodeFailure(
  hostBitmapEncode: Readonly<HostBitmapEncodeProvider>,
  format: ImageFormat,
): BitmapEncodeFailureExplanation | null {
  const resolution = resolveBitmapEncode(hostBitmapEncode, format);
  return resolution.reason === null ? null : { format: resolution.format, reason: resolution.reason };
}

type BitmapEncodeResolution =
  | {
      readonly backend: {
        readonly graphics: { readonly bitmapEncode: HostBitmapEncodeProvider };
      }['graphics']['bitmapEncode'];
      readonly format: ImageFormat;
      readonly reason: null;
    }
  | {
      readonly backend:
        | { readonly graphics: { readonly bitmapEncode: HostBitmapEncodeProvider } }['graphics']['bitmapEncode']
        | null;
      readonly format: ImageFormat;
      readonly reason: BitmapEncodeFailureExplanation['reason'];
    };

function resolveBitmapEncode(
  hostBitmapEncode: Readonly<HostBitmapEncodeProvider>,
  format: ImageFormat,
): BitmapEncodeResolution {
  const normalizedFormat: ImageFormat = format === 'jpeg' ? 'jpeg' : 'png';
  const backend = hostBitmapEncode;
  if (!backend.supportedFormats.includes(normalizedFormat)) {
    return { backend, format: normalizedFormat, reason: 'format-unsupported' };
  }
  return { backend, format: normalizedFormat, reason: null };
}
