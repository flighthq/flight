import { swfPlaceObject3Handler } from './swfPlaceObject3Handler.ts';
import { swfPlaceObjectHandler } from './swfPlaceObjectHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfPlacementTagFamily: readonly SwfTagHandler[] = [swfPlaceObjectHandler, swfPlaceObject3Handler];
