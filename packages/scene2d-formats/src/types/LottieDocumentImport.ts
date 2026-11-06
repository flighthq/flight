import type { AnimationClip } from '@flighthq/animation/contract';
import type { Entity } from '@flighthq/entity/contract';
import type { ImageResource } from '@flighthq/image/contract';
import type { DisplayObject } from '@flighthq/scene2d/contract';

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
