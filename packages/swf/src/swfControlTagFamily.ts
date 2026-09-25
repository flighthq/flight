import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfControlHandler } from './swfControlHandler.ts';

export const swfControlTagFamily: readonly SwfTagHandler[] = [swfControlHandler];
