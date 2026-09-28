import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { Node2D, SvgElementContext } from '@flighthq/types/contract';

import { applySvgElementClipFamily } from './svgDocument.ts';
import { appendSvgChildren, applySvgElementAppearance } from './svgDocument.ts';
import { createSvgViewportMatrix } from './svgTransform.ts';
import { svgLocalName } from './svgXml.ts';

/**
 * The container elements — `a`, `g`, `svg`, `switch` — which carry children and a coordinate system and draw nothing.
 *
 * ★ THE ONLY FAMILY THAT RE-ENTERS THE WALK, which is why it — and only it — imports `appendSvgChildren`. A nested
 * `<svg>` also establishes a new viewport, so the container is where a viewBox fit is applied to everything below it.
 */
export function svgContainerElementHandler(context: SvgElementContext): Node2D | null {
  const { element, parentStyle } = context;
  const importContext = context.import;
  const container = createDisplayObject();
  const name = svgLocalName(element.name);
  const viewport = name === 'svg' ? createSvgViewportMatrix(element) : null;
  const style = applySvgElementAppearance(container, element, parentStyle, importContext, viewport, true);
  appendSvgChildren(container, element, style, importContext);
  applySvgElementClipFamily(container, element, importContext);
  return container;
}
