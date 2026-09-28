// Containers and geometry: shapes, their paint and their gradients, with no text, no images, no `use` and NO CLIPPING.
// ★ THE SELECTIVE ENTRY IS `createScene2DFromSvgDocumentWithRegistry`, NOT `createScene2DFromSvgDocument`. The
// zero-config entry resolves both families from its own defaults, so it names every handler whatever a caller passes in
// options — keeping that default is deliberate, since asking for everything should cost everything.
//
// Declining `clipHandlers` is what keeps `@flighthq/clip`, the bounding-box measurement and the clip's own second
// reading of the geometry elements and of `use` out of the bundle. It means this build does not clip, which is the
// honest meaning of registering no reader.
import {
  createScene2DFromSvgDocumentWithRegistry,
  createSvgRegistry,
  registerSvgElementHandler,
  svgContainerElementHandler,
  svgGeometryElementHandler,
} from '@flighthq/scene2d-formats';
import { SvgElementKind } from '@flighthq/types';

const registry = createSvgRegistry();
registerSvgElementHandler(registry, SvgElementKind.Container, svgContainerElementHandler);
registerSvgElementHandler(registry, SvgElementKind.Geometry, svgGeometryElementHandler);

export const result = createScene2DFromSvgDocumentWithRegistry('<svg/>', registry);
