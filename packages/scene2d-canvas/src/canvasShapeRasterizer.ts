import type { CanvasTextureResolvers, ShapeRasterizer } from '@flighthq/types/contract';

import { renderCanvasShapeCommands } from './canvasShape';

// Builds the rasterizer a GPU or DOM backend registers to draw the fills it has no tessellated form for.
//
// The resolver set is what makes this more than a bare context: texture fills resolve their pixels
// through it, so a rasterizer can paint exactly the source kinds that set has resolvers for. Passing the
// set your Canvas renderer already uses — getCanvasRenderStateTextureResolvers(state) — shares one
// transcode cache between the two backends; passing a fresh one keeps them separate. Either way the
// capability is named at the callsite instead of being whatever the renderer happened to reach.
export function createCanvasShapeRasterizer(resolvers: CanvasTextureResolvers, allowSmoothing = true): ShapeRasterizer {
  return (context, commands, state) => {
    renderCanvasShapeCommands(context, commands as unknown[], resolvers, state, allowSmoothing);
  };
}
