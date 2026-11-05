import type { AnimationClip, DisplayObject, Entity, ImageResource } from '@flighthq/types/contract';

import type { LottieImageAsset } from './LottieDocument.ts';
import type {
  LottieAdvancedBlend,
  LottieLayerHandlerEntry,
  LottieMaskHandlerEntry,
  LottieShapeItemHandlerEntry,
} from './LottieRegistry.ts';

export interface LottieDocumentImportOptions {
  layerHandlers?: LottieLayerHandlerEntry[];
  maskHandlers?: LottieMaskHandlerEntry[];
  resolveImageResource?: (asset: Readonly<LottieImageAsset>) => ImageResource | null;
  shapeItemHandlers?: LottieShapeItemHandlerEntry[];
}

export interface LottieDocumentImportResult extends Entity {
  advancedBlends: LottieAdvancedBlend[];
  clip: AnimationClip;
  duration: number;
  frameRate: number;
  root: DisplayObject;
}
