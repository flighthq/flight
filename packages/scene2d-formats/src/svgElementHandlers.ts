import type { Node2D, SvgElementContext, SvgElementHandler, SvgRegistry } from '@flighthq/types/contract';
import { SvgElementKind } from '@flighthq/types/contract';

import {
  svgContainerElementReader,
  svgGeometryElementReader,
  svgImageElementReader,
  svgTextElementReader,
  svgUseElementReader,
} from './svgDocument.ts';
import { registerSvgElementHandler } from './svgRegistry.ts';

export function registerSvgElementHandlers(registry: SvgRegistry): void {
  registerSvgElementHandler(registry, SvgElementKind.Container, svgContainerElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Geometry, svgGeometryElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Image, svgImageElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Text, svgTextElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Use, svgUseElementHandler);
}

export function svgContainerElementHandler(context: SvgElementContext): Node2D | null {
  return svgContainerElementReader(context);
}

export function svgGeometryElementHandler(context: SvgElementContext): Node2D | null {
  return svgGeometryElementReader(context);
}

export function svgImageElementHandler(context: SvgElementContext): Node2D | null {
  return svgImageElementReader(context);
}

export function svgTextElementHandler(context: SvgElementContext): Node2D | null {
  return svgTextElementReader(context);
}

export function svgUseElementHandler(context: SvgElementContext): Node2D | null {
  return svgUseElementReader(context);
}

export const svgAllElementHandlers: readonly SvgElementHandler[] = [
  svgContainerElementHandler,
  svgGeometryElementHandler,
  svgImageElementHandler,
  svgTextElementHandler,
  svgUseElementHandler,
];
