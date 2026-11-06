import { swfSoundHandler } from './swfSoundHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfSoundTagFamily: readonly SwfTagHandler[] = [swfSoundHandler];
