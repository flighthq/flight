import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfSpriteHandler } from './swfSpriteHandler';

export const swfSpriteTagFamily: readonly SwfTagHandler[] = [swfSpriteHandler];
