import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfEditTextHandler } from './swfEditTextHandler.ts';
import { swfStaticTextHandler } from './swfStaticTextHandler.ts';

export const swfTextTagFamily: readonly SwfTagHandler[] = [swfStaticTextHandler, swfEditTextHandler];
