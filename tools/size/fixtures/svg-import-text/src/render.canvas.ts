// Containers and text: labels and their formats, with no geometry, no gradients, no images and no clipping.
import {
  createScene2DFromSvgDocumentWithRegistry,
  createSvgRegistry,
  registerSvgElementHandler,
  svgContainerElementHandler,
  svgTextElementHandler,
} from '@flighthq/scene2d-formats';
import { SvgElementKind } from '@flighthq/types';

const registry = createSvgRegistry();
registerSvgElementHandler(registry, SvgElementKind.Container, svgContainerElementHandler);
registerSvgElementHandler(registry, SvgElementKind.Text, svgTextElementHandler);

export const result = createScene2DFromSvgDocumentWithRegistry('<svg/>', registry);
