import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfDefineMorphShapeHandler } from './swfDefineMorphShapeHandler';
import { swfDefineShapeHandler } from './swfDefineShapeHandler';

export const swfShapeTagFamily: SwfTagFamily = composeSwfTagHandlers([
  swfDefineShapeHandler,
  swfDefineMorphShapeHandler,
]);
