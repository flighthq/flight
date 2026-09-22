import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfJpegBitmapHandler } from './swfJpegBitmapHandler';
import { swfLosslessBitmapHandler } from './swfLosslessBitmapHandler';

export const swfBitmapTagFamily: SwfTagFamily = composeSwfTagHandlers([swfJpegBitmapHandler, swfLosslessBitmapHandler]);
