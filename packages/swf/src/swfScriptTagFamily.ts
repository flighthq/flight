import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfScriptHandler } from './swfScriptHandler';

export const swfScriptTagFamily: SwfTagFamily = composeSwfTagHandlers([swfScriptHandler]);
