import type { CanvasTextureResolvers, NonEntityCreateResult, ShapeRasterizer } from '@flighthq/types/contract';

import { renderCanvasShapeCommands } from './canvasShape';

// Builds the rasterizer a GPU or DOM backend registers to draw the fills it has no tessellated form for.
//
// The resolver set is what makes this more than a bare context: texture fills resolve their pixels
// through it, so a rasterizer can paint exactly the source kinds that set has resolvers for. Passing the
// set your Canvas renderer already uses — getCanvasRenderStateTextureResolvers(state) — shares one
// transcode cache between the two backends; passing a fresh one keeps them separate. Either way the
// capability is named at the callsite instead of being whatever the renderer happened to reach.
//
// The command set and the smoothing policy come from the state the backend hands the rasterizer, so
// registering commands onto that state is what makes them reachable here.
export function createCanvasShapeRasterizer(
  resolvers: CanvasTextureResolvers,
): NonEntityCreateResult<ShapeRasterizer, 'type-only'> {
  return (context, commands, state) => {
    renderCanvasShapeCommands(context, state, commands as unknown[], resolvers);
  };
}
