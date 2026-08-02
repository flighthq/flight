import type { CanvasRenderState, ShapeRasterizer } from '@flighthq/types/contract';

import { renderCanvasShapeCommands } from './canvasShape';

// Builds the rasterizer a GPU or DOM backend registers to draw the fills it has no tessellated form for.
//
// The `CanvasRenderState` is what makes this more than a bare context: texture fills resolve their
// pixels through that state's texture-resolver registry, so a rasterizer can only draw the source kinds
// its state has resolvers for. Passing the state your Canvas renderer already uses shares one transcode
// cache between the two backends; passing a state over an offscreen canvas keeps them separate. Either
// way the state is named at the callsite, so what the fallback can and cannot paint is a property of
// what the caller registered rather than of what the renderer happened to reach.
export function createCanvasShapeRasterizer(canvasRenderState: CanvasRenderState): ShapeRasterizer {
  return (context, commands, state) => {
    renderCanvasShapeCommands(context, commands as unknown[], canvasRenderState, state);
  };
}
