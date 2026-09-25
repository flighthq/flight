import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfSpriteHandler } from './swfSpriteHandler.ts';

export const swfSpriteTagFamily: readonly SwfTagHandler[] = [swfSpriteHandler];
