import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfDefineMorphShapeHandler } from './swfDefineMorphShapeHandler';
import { swfDefineShapeHandler } from './swfDefineShapeHandler';

export const swfShapeTagFamily: readonly SwfTagHandler[] = [swfDefineShapeHandler, swfDefineMorphShapeHandler];
