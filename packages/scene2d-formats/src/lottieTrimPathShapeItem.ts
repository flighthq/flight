import type { LottieShapeItemContext, LottieTrimPathShapeItem } from '@flighthq/types/contract';

import { isAnimatedLottieProperty, reportLottieSkip } from './lottieDocument.ts';
export function lottieTrimPathShapeItemHandler(context: LottieShapeItemContext): void {
  const trim = context.item as Readonly<LottieTrimPathShapeItem>;
  if (isAnimatedLottieProperty(trim.s) || isAnimatedLottieProperty(trim.e) || isAnimatedLottieProperty(trim.o)) {
    reportLottieSkip(context.import, 'lottie.unsupported-shape-modifier', 'lottieTrimPathShapeItemHandler', {
      modifier: context.item.ty,
    });
  }
}
