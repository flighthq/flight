import { swfVideoHandler } from './swfVideoHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfVideoTagFamily: readonly SwfTagHandler[] = [swfVideoHandler];
