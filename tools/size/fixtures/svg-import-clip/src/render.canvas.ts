// ★ `svg-import-geometry` PLUS THE CLIP FAMILY, and nothing else. The pair prices clipping on its own: the clip handler
// brings `@flighthq/clip`, the bounding-box measurement, the clip path traversal and the clip's own `use` resolution, and
// the difference between the two bundles is exactly what registering it costs. While clipping was a step in the element
// walk the difference would have been zero, because every build already carried all of it.
import {
  createScene2DFromSvgDocumentWithRegistry,
  createSvgRegistry,
  registerSvgClipHandler,
  registerSvgElementHandler,
  svgContainerElementHandler,
  svgGeometryElementHandler,
  svgPathClipHandler,
} from '@flighthq/scene2d-formats';
import { SvgClipKind, SvgElementKind } from '@flighthq/types';

const registry = createSvgRegistry();
registerSvgElementHandler(registry, SvgElementKind.Container, svgContainerElementHandler);
registerSvgElementHandler(registry, SvgElementKind.Geometry, svgGeometryElementHandler);
registerSvgClipHandler(registry, SvgClipKind.Path, svgPathClipHandler);

export const result = createScene2DFromSvgDocumentWithRegistry('<svg/>', registry);
