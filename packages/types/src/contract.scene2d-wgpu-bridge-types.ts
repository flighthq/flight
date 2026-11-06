// Exact narrow bridge for the Scene2D-WGPU owner contract project. These shared headers remain in
// Types until their own packages gain acyclic contract lanes; keeping the bridge here prevents the
// owner project from selecting an unrelated suffix barrel or depending on the full Types project.
export type { ColorScaleBias } from './ColorScaleBias.ts';
export type { RenderProxy2D } from '@flighthq/render/contract';
