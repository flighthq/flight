import type { HostBitmapCapabilities } from '@flighthq/types/contract';

import { webHostBitmapEncode } from './webBitmapEncode';
import { webHostBitmapReadback } from './webBitmapReadback';

export const webHostBitmap = {
  encode: webHostBitmapEncode,
  readback: webHostBitmapReadback,
} satisfies HostBitmapCapabilities;
