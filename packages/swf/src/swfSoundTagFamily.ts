import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfSoundHandler } from './swfSoundHandler';

export const swfSoundTagFamily: SwfTagFamily = composeSwfTagHandlers([swfSoundHandler]);

export { initializeTimelineAudioCue, initializeTimelineStreamAudioCue } from './swfSoundHandler';
