import type { LottieMaskHandler, LottieRegistry } from '@flighthq/types/contract';
import { LottieMaskKind } from '@flighthq/types/contract';

import { lottieAdditiveMaskHandler } from './lottieMask.ts';
import { registerLottieMaskHandler } from './lottieRegistry.ts';

/**
 * The mask family: every handler Flight lowers a Lottie mask with, and the registrar that installs them all.
 *
 * ★ ONE MEMBER TODAY, AND THE FAMILY IS STILL THE POINT. Masks used to be a step in the document core's layer walk,
 * which meant `@flighthq/clip` and the bezier path reader were in every bundle — a null-layer-only import paid for
 * clipping it could never use. Naming the family is what lets a caller leave it out, and what gives the composed
 * modes somewhere to land if they are ever carried.
 */
export function registerLottieMaskHandlers(registry: LottieRegistry): void {
  registerLottieMaskHandler(registry, LottieMaskKind.Additive, lottieAdditiveMaskHandler);
}

export const lottieAllMaskHandlers: readonly LottieMaskHandler[] = [lottieAdditiveMaskHandler];
