import type { Bitmap } from './Bitmap';
import type { BitmapReadbackBlockReason } from './BitmapReadback';
import type { HostImageSource } from './HostImageSource';

// `probe` settles only expected source/canvas refusal with one pixel and never allocates a Bitmap.
// `bitmap` performs the full read and returns the materialized Bitmap on success.
export type BitmapReadbackMode = 'bitmap' | 'probe';

export type BitmapReadbackBackendReason = Exclude<BitmapReadbackBlockReason, 'backend-not-installed' | 'empty-size'>;

export interface BitmapReadbackOutcome {
  readonly bitmap: Bitmap | null;
  readonly reason: BitmapReadbackBackendReason;
}

export interface BitmapReadbackBackend {
  readBitmap(source: HostImageSource, width: number, height: number, mode: BitmapReadbackMode): BitmapReadbackOutcome;
}
