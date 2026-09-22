import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfJpegBitmapHandler } from './swfJpegBitmapHandler';
import { swfLosslessBitmapHandler } from './swfLosslessBitmapHandler';

export const swfBitmapTagFamily: readonly SwfTagHandler[] = [swfJpegBitmapHandler, swfLosslessBitmapHandler];
