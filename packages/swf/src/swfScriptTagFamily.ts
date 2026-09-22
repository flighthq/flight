import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfScriptHandler } from './swfScriptHandler';

export const swfScriptTagFamily: readonly SwfTagHandler[] = [swfScriptHandler];
