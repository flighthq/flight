import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfControlHandler } from './swfControlHandler';

export const swfControlTagFamily: readonly SwfTagHandler[] = [swfControlHandler];
