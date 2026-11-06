/** @deprecated Import Scene3DAnimationPath from `@flighthq/scene3d/contract`. */
export type { Scene3DAnimationPath } from '@flighthq/scene3d/contract';

// Duplicated compatibility values avoid a runtime cycle through the @flighthq/types facade.
export const Scene3DAnimationPathRotation = 'Rotation';
export const Scene3DAnimationPathScale = 'Scale';
export const Scene3DAnimationPathTranslation = 'Translation';
export const Scene3DAnimationPathWeights = 'Weights';
