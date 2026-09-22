import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfVideoHandler } from './swfVideoHandler';

export const swfVideoTagFamily: readonly SwfTagHandler[] = [swfVideoHandler];
