import { swfSpriteHandler } from './swfSpriteHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfSpriteTagFamily: readonly SwfTagHandler[] = [swfSpriteHandler];
