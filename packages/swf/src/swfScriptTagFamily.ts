import { swfScriptHandler } from './swfScriptHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfScriptTagFamily: readonly SwfTagHandler[] = [swfScriptHandler];
