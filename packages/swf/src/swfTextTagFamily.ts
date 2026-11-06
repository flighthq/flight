import { swfEditTextHandler } from './swfEditTextHandler.ts';
import { swfStaticTextHandler } from './swfStaticTextHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfTextTagFamily: readonly SwfTagHandler[] = [swfStaticTextHandler, swfEditTextHandler];
