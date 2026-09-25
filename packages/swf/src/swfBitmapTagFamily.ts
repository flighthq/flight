import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfJpegBitmapHandler } from './swfJpegBitmapHandler.ts';
import { swfLosslessBitmapHandler } from './swfLosslessBitmapHandler.ts';

export const swfBitmapTagFamily: readonly SwfTagHandler[] = [swfJpegBitmapHandler, swfLosslessBitmapHandler];
