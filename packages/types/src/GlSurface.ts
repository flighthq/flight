import type { GlContext } from './GlContext.ts';
import type { Surface } from './Surface.ts';

// A GL rendering surface: a host-allocated drawable with an acquired GL context. Created by
// createGlSurface from a window, or by createGlSurfaceFromNativeHandle for a drawable the caller already
// owns. The context is a public field because GlContext is Flight's own structural type; the drawable
// behind it is a platform object and lives on the runtime. Backing store dimensions are deliberately
// absent — the context reads them live through drawingBufferWidth/drawingBufferHeight.
export interface GlSurface extends Surface {
  readonly __brand: 'GlSurface';
  readonly context: GlContext;
}
