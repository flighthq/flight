import type { RenderState } from './RenderState';
import type { ShapeCommandToken } from './ShapeCommand';

// Replays a shape's command stream into a 2D context, for a backend that cannot express every fill as
// GPU geometry. A gradient or a texture fill has no tessellated form in the leaf renderers, so those
// backends rasterize the shape and upload the result as a single quad.
//
// The backend owns the canvas, the upload, and the caching; a rasterizer owns only the replay — and
// with it the texture-resolution registry the fills resolve through, which is why this is a value the
// caller supplies rather than a call the renderer makes on its own. A backend with no rasterizer
// registered draws its solid shapes and reports a registry miss for the rest, instead of silently
// dropping the fills it cannot express.
//
// `state` is the backend's own render state, passed through for registry-miss reporting only.
export type ShapeRasterizer = (
  context: CanvasRenderingContext2D,
  commands: readonly ShapeCommandToken[],
  state: RenderState,
) => void;
