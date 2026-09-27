import type { LottieRegistry } from '@flighthq/types/contract';

import { registerLottieLayerHandlers } from './lottieLayerHandlers.ts';
import { registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';

export function registerAllLottieHandlers(registry: LottieRegistry): void {
  registerLottieLayerHandlers(registry);
  registerLottieShapeItemHandlers(registry);
}
