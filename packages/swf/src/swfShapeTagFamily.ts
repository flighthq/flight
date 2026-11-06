import { swfDefineMorphShapeHandler } from './swfDefineMorphShapeHandler.ts';
import { swfDefineShapeHandler } from './swfDefineShapeHandler.ts';
import type { SwfTagHandler } from './types/SwfTagHandler.ts';

export const swfShapeTagFamily: readonly SwfTagHandler[] = [swfDefineShapeHandler, swfDefineMorphShapeHandler];
