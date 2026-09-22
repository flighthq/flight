import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfSpriteHandler } from './swfSpriteHandler';

export const swfSpriteTagFamily: SwfTagFamily = composeSwfTagHandlers([swfSpriteHandler]);
