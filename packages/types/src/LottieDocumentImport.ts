import type { AnimationClip } from './AnimationClip.ts';
import type { DisplayObject } from './DisplayObject.ts';
import type { Entity } from './Entity.ts';
import type { ImageResource } from './ImageResource.ts';
import type { LottieImageAsset } from './LottieDocument.ts';
import type { LottieAdvancedBlend, LottieLayerHandlerEntry, LottieShapeItemHandlerEntry } from './LottieRegistry.ts';

export interface LottieDocumentImportOptions {
  layerHandlers?: LottieLayerHandlerEntry[];
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
