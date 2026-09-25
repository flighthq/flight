import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfScriptHandler } from './swfScriptHandler.ts';

export const swfScriptTagFamily: readonly SwfTagHandler[] = [swfScriptHandler];
