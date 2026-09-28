import type { SvgElementHandler, SvgRegistry } from '@flighthq/types/contract';
import { SvgElementKind } from '@flighthq/types/contract';

import { svgContainerElementHandler } from './svgContainerElement.ts';
import { svgGeometryElementHandler } from './svgGeometryElement.ts';
import { svgImageElementHandler } from './svgImageElement.ts';
import { registerSvgElementHandler } from './svgRegistry.ts';
import { svgTextElementHandler } from './svgTextElement.ts';
import { svgUseElementHandler } from './svgUseElement.ts';

/**
 * The element family: every handler Flight reads an SVG element with, and the registrar that installs them all.
 *
 * ★ THIS FILE IS THE PRESET AND NOTHING ELSE. Each handler now lives in the module that owns its interpretation, so
 * naming one links one element family while importing THIS module links all five — the shape and gradient builders for
 * geometry, `@flighthq/text` and `@flighthq/textlayout` for text, the sprite and texture for images. It used to hold
 * five one-line shims into readers retained in a 1,780-line document core, which meant naming any handler linked every
 * one of them plus the whole core.
 *
 * Nothing here registers itself. `registerSvgElementHandlers` is the explicit step a zero-config caller takes.
 */
export function registerSvgElementHandlers(registry: SvgRegistry): void {
  registerSvgElementHandler(registry, SvgElementKind.Container, svgContainerElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Geometry, svgGeometryElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Image, svgImageElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Text, svgTextElementHandler);
  registerSvgElementHandler(registry, SvgElementKind.Use, svgUseElementHandler);
}

export const svgAllElementHandlers: readonly SvgElementHandler[] = [
  svgContainerElementHandler,
  svgGeometryElementHandler,
  svgImageElementHandler,
  svgTextElementHandler,
  svgUseElementHandler,
];
