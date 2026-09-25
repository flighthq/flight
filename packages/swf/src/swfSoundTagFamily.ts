import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfSoundHandler } from './swfSoundHandler.ts';

export const swfSoundTagFamily: readonly SwfTagHandler[] = [swfSoundHandler];
