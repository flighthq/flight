import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfDefineMorphShapeHandler } from './swfDefineMorphShapeHandler.ts';
import { swfDefineShapeHandler } from './swfDefineShapeHandler.ts';

export const swfShapeTagFamily: readonly SwfTagHandler[] = [swfDefineShapeHandler, swfDefineMorphShapeHandler];
