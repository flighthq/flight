import { packColor } from '@flighthq/color/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createTextLabel } from '@flighthq/text/contract';
import type {
  DisplayObject,
  LottieImportContext,
  LottieLayer,
  LottieLayerContext,
  LottieTextDocument,
} from '@flighthq/types/contract';

import { reportLottieDrop } from './lottieDocument.ts';

/**
 * The text layer: the first text document of an animated text property, as one label.
 *
 * Lottie animates text by keyframing whole documents, so only `d.k[0]` is carried; a layer with no document at all is
 * a drop. The format's own justification codes and its 1.25 line-height convention live here because nothing else in
 * the importer reads them.
 */
export function lottieTextLayerHandler(context: LottieLayerContext): void {
  appendLottieText(context.container, context.layer, context.import);
}

function appendLottieText(parent: DisplayObject, layer: Readonly<LottieLayer>, context: LottieImportContext): void {
  const textData = layer.t;
  const first = textData?.d.k[0]?.s;
  if (first === undefined) {
    reportLottieDrop(context, 'lottie.text-missing-document', 'appendLottieText', { layer: layer.nm ?? '' });
    return;
  }
  const label = createTextLabel({
    data: {
      autoSize: 'left',
      height: (first.s ?? 16) * 1.25,
      text: first.t,
      textFormat: createLottieTextFormat(first),
      width: context.document.w,
    },
  });
  addNodeChild(parent, label);
}

function createLottieTextFormat(document: Readonly<LottieTextDocument>) {
  const color = document.fc ?? [0, 0, 0];
  return {
    align: document.j === 1 ? ('right' as const) : document.j === 2 ? ('center' as const) : ('left' as const),
    color: packColor(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, 1),
    font: document.f,
    leading: document.lh,
    letterSpacing: document.tr,
    size: document.s,
  };
}
