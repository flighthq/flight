import { swfJpegBitmapHandler } from './swfJpegBitmapHandler.ts';
import { swfLosslessBitmapHandler } from './swfLosslessBitmapHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfBitmapTagFamily: readonly SwfTagHandler[] = [swfJpegBitmapHandler, swfLosslessBitmapHandler];
