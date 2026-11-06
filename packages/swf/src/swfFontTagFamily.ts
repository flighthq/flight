import { swfFontHandler } from './swfFontHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfFontTagFamily: readonly SwfTagHandler[] = [swfFontHandler];
