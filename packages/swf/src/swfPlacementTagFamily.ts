import type { SwfTagFamily } from '@flighthq/types/contract';

import { composeSwfTagHandlers } from './composeSwfTagHandlers';
import { swfPlaceObject3Handler } from './swfPlaceObject3Handler';
import { swfPlaceObjectHandler } from './swfPlaceObjectHandler';

export const swfPlacementTagFamily: SwfTagFamily = composeSwfTagHandlers([
  swfPlaceObjectHandler,
  swfPlaceObject3Handler,
]);
