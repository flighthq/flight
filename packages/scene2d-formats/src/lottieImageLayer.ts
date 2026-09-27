import { addNodeChild } from '@flighthq/node/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  DisplayObject,
  LottieAsset,
  LottieImageAsset,
  LottieImportContext,
  LottieLayer,
  LottieLayerContext,
} from '@flighthq/types/contract';

import { reportLottieDrop, reportLottieSkip } from './lottieDocument.ts';

/**
 * The image layer: a sprite over the texture the caller's resolver returns for the referenced asset.
 *
 * ★ THE RESOLVER IS THE CALLER'S, AND ITS ABSENCE IS NOT AN ERROR. An unresolved image is a skip, not a drop — the
 * document is intact and the caller simply did not supply that asset — while a missing or non-image asset entry IS a
 * document defect and drops. Keeping both reports here is why a build without image layers links neither the sprite
 * nor the texture package.
 */
export function lottieImageLayerHandler(context: LottieLayerContext): void {
  appendLottieImage(context.container, context.layer, context.import);
}

function appendLottieImage(parent: DisplayObject, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const asset = layer.refId === undefined ? undefined : context.assets.get(layer.refId);
  if (asset === undefined || !isImageAsset(asset)) {
    reportLottieDrop(context, 'lottie.unresolved-asset', 'appendLottieImage', { id: layer.refId ?? '' });
    return;
  }
  const image = context.resolveImageResource?.(asset) ?? null;
  if (image === null) {
    reportLottieSkip(context, 'lottie.unresolved-image', 'appendLottieImage', { id: asset.id });
    return;
  }
  addNodeChild(parent, createSprite({ data: { texture: createTexture({ dimension: '2d', source: image }) } }));
}

function isImageAsset(asset: Readonly<LottieAsset>): asset is Readonly<LottieImageAsset> {
  return 'p' in asset;
}
