import type { LottieRegistry } from './contract.scene2d-formats-types.ts';
import { registerLottieLayerHandlers } from './lottieLayerHandlers.ts';
import { registerLottieMaskHandlers } from './lottieMaskHandlers.ts';
import { registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';

export function registerAllLottieHandlers(registry: LottieRegistry): void {
  registerLottieLayerHandlers(registry);
  registerLottieMaskHandlers(registry);
  registerLottieShapeItemHandlers(registry);
}
