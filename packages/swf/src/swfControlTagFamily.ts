import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfControlHandler } from './swfControlHandler';

export const swfControlTagFamily: SwfTagFamily = composeSwfTagHandlers([swfControlHandler]);
