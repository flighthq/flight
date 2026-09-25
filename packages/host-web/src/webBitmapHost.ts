import type { HostBitmapCapabilities } from '@flighthq/types/contract';

import { webHostBitmapEncode } from './webBitmapEncode.ts';
import { webHostBitmapReadback } from './webBitmapReadback.ts';

export const webHostBitmap = {
  encode: webHostBitmapEncode,
  readback: webHostBitmapReadback,
} satisfies HostBitmapCapabilities;
