import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfFontHandler } from './swfFontHandler';

export const swfFontTagFamily: SwfTagFamily = composeSwfTagHandlers([swfFontHandler]);
