import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfFontHandler } from './swfFontHandler.ts';

export const swfFontTagFamily: readonly SwfTagHandler[] = [swfFontHandler];
