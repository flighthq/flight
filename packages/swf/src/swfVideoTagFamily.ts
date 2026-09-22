import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfVideoHandler } from './swfVideoHandler';

export const swfVideoTagFamily: SwfTagFamily = composeSwfTagHandlers([swfVideoHandler]);
