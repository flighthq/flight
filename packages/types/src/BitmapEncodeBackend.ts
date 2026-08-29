import type { Bitmap } from './Bitmap';
import type { ImageFormat } from './ImageFormat';

// Synchronous Bitmap encoding implemented by a host or native codec. `supportedFormats` is plain
// capability data so callers can explain an unsupported-format sentinel without invoking the encoder.
export interface BitmapEncodeBackend {
  encodeBitmap(source: Readonly<Bitmap>, format: ImageFormat, quality: number): Uint8Array;
  readonly supportedFormats: readonly ImageFormat[];
}

export type BitmapEncodeOperation = Exclude<keyof BitmapEncodeBackend, 'supportedFormats'>;
