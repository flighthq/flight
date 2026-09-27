import type {
  DisplayObject,
  LottieAsset,
  LottieImportContext,
  LottieLayer,
  LottieLayerContext,
  LottiePrecompositionAsset,
} from '@flighthq/types/contract';

import { appendLottieLayers, reportLottieDrop } from './lottieDocument.ts';

/**
 * The precomposition layer: another composition's layers, re-walked under this layer's time mapping.
 *
 * ★ THIS IS THE ONE LAYER THAT RE-ENTERS THE CORE'S WALK, which is why it — and only it — imports `appendLottieLayers`.
 * The recursion guard is the layer's own: a composition that references itself would otherwise never terminate, and
 * the id is held for the duration of the nested walk rather than for the whole import, so two sibling references to
 * the same composition both resolve.
 */
export function lottiePrecompositionLayerHandler(context: LottieLayerContext): void {
  appendLottiePrecomposition(context.container, context.layer, context.import);
}

function appendLottiePrecomposition(
  parent: DisplayObject,
  layer: Readonly<LottieLayer>,
  context: LottieImportContext,
): void {
  const id = layer.refId;
  const asset = id === undefined ? undefined : context.assets.get(id);
  if (id === undefined || asset === undefined || !isPrecompositionAsset(asset)) {
    reportLottieDrop(context, 'lottie.unresolved-asset', 'appendLottiePrecomposition', { id: id ?? '' });
    return;
  }
  if (context.resolvingPrecompositions.has(id)) {
    reportLottieDrop(context, 'lottie.recursive-precomposition', 'appendLottiePrecomposition', { id });
    return;
  }
  context.resolvingPrecompositions.add(id);
  appendLottieLayers(parent, asset.layers, {
    ...context,
    frameOffset: context.frameOffset + (layer.st ?? 0) * context.frameScale,
    frameScale: context.frameScale * (layer.sr ?? 1),
  });
  context.resolvingPrecompositions.delete(id);
}

function isPrecompositionAsset(asset: Readonly<LottieAsset>): asset is Readonly<LottiePrecompositionAsset> {
  return 'layers' in asset;
}
