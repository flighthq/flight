import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfEditTextHandler } from './swfEditTextHandler';
import { swfStaticTextHandler } from './swfStaticTextHandler';

export const swfTextTagFamily: readonly SwfTagHandler[] = [swfStaticTextHandler, swfEditTextHandler];
