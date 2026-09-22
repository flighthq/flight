import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfEditTextHandler } from './swfEditTextHandler';
import { swfStaticTextHandler } from './swfStaticTextHandler';

export const swfTextTagFamily: SwfTagFamily = composeSwfTagHandlers([swfStaticTextHandler, swfEditTextHandler]);
