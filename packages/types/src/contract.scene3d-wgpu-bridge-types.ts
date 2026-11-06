// Exact narrow bridge for the Scene3D-WGPU owner contract project. These shared headers remain in
// Types until their own packages gain acyclic contract lanes; keeping the bridge here prevents the
// owner project from selecting an unrelated suffix barrel or depending on the full Types project.
export type { Scene3DLightBlock } from './Scene3DLightBlock.ts';
export type { Scene3DLightsLike } from './Scene3DLights.ts';
