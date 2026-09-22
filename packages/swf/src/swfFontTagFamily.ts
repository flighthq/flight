import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfFontHandler } from './swfFontHandler';

export const swfFontTagFamily: readonly SwfTagHandler[] = [swfFontHandler];
