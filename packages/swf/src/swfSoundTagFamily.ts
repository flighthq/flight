import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfSoundHandler } from './swfSoundHandler';

export const swfSoundTagFamily: readonly SwfTagHandler[] = [swfSoundHandler];
