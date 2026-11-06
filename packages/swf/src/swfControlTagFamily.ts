import { swfControlHandler } from './swfControlHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfControlTagFamily: readonly SwfTagHandler[] = [swfControlHandler];
