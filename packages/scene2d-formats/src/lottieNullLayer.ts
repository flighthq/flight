import type { LottieLayerContext } from '@flighthq/types/contract';

/**
 * The null layer: a transform with no content of its own.
 *
 * ★ BEDROCK, AND THE REASON THIS FILE EXISTS ANYWAY. The handler body is empty because a null layer's entire
 * contribution — its transform, its visibility window, its parenting — is what the core does for EVERY layer before
 * dispatch. Splitting it further would be blood from a stone; keeping it here instead of in the preset is what lets a
 * caller register the null kind alone and link nothing but this file.
 */
export function lottieNullLayerHandler(_context: LottieLayerContext): void {}
