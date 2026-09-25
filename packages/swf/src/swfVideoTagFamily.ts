import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfVideoHandler } from './swfVideoHandler.ts';

export const swfVideoTagFamily: readonly SwfTagHandler[] = [swfVideoHandler];
