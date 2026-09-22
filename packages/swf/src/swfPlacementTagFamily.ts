import type { SwfTagHandler } from '@flighthq/types/contract';

import { swfPlaceObject3Handler } from './swfPlaceObject3Handler';
import { swfPlaceObjectHandler } from './swfPlaceObjectHandler';

export const swfPlacementTagFamily: readonly SwfTagHandler[] = [swfPlaceObjectHandler, swfPlaceObject3Handler];
