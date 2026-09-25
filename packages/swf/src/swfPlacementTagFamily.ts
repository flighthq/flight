import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfPlaceObject3Handler } from './swfPlaceObject3Handler.ts';
import { swfPlaceObjectHandler } from './swfPlaceObjectHandler.ts';

export const swfPlacementTagFamily: readonly SwfTagHandler[] = [swfPlaceObjectHandler, swfPlaceObject3Handler];
