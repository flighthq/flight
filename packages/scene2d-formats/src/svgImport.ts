import type {
  DisplayObject,
  ImportDiagnostic,
  SvgDocumentImportOptions,
  SvgElementHandlerEntry,
} from '@flighthq/types/contract';
import { SvgElementKind } from '@flighthq/types/contract';

import { svgContainerElementHandler } from './svgContainerElement.ts';
import { createScene2DFromSvgDocumentWithRegistry } from './svgDocument.ts';
import { svgGeometryElementHandler } from './svgGeometryElement.ts';
import { svgImageElementHandler } from './svgImageElement.ts';
import { createSvgRegistry, registerSvgElementHandler } from './svgRegistry.ts';
import { svgTextElementHandler } from './svgTextElement.ts';
import { svgUseElementHandler } from './svgUseElement.ts';

/**
 * Reads an SVG document into a scene, with every element family Flight supports unless the caller names fewer.
 *
 * ★ THIS MODULE EXISTS TO OWN THE DEFAULT, AND NOTHING ELSE. `createScene2DFromSvgDocumentWithRegistry` does the work
 * and takes the registry as an argument; resolving `undefined` to the full family is the one thing that cannot live
 * there, because naming five handlers from the orchestrator would put the geometry, gradient, text and image code into
 * the module graph of every caller — including the caller who asked for containers and geometry only.
 *
 * Behaviour is unchanged for every existing caller: `createScene2DFromSvgDocument(source)` reads what it always read,
 * in the order it always read it, and the `elementHandlers` option narrows exactly as before.
 */
/**
 * Imports a static SVG document into a Flight display-object subtree. The returned container is
 * always allocated; malformed or non-SVG input yields an empty container and an opt-in Reject
 * diagnostic. The importer covers the document concerns above `@flighthq/path-formats`: SVG
 * geometry, inherited presentation styles, basic stylesheet selectors, transforms, gradients,
 * groups, nested SVG view boxes, `defs`/`use`, text, clip paths, and hard-mask degradation.
 *
 * SVG is consumed as a static authoring artifact. Animation, filters, scripting, foreign objects,
 * and live DOM behavior are deliberately not retained. Pass an `ImportDiagnostic[]` collector to
 * observe every recognized feature that was skipped or recovered.
 */
export function createScene2DFromSvgDocument(
  source: string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<SvgDocumentImportOptions>,
): DisplayObject {
  const registry = createSvgRegistry();
  for (const entry of options?.elementHandlers ?? defaultSvgElementHandlers()) {
    registerSvgElementHandler(registry, entry.kind, entry.handle);
  }
  return createScene2DFromSvgDocumentWithRegistry(source, registry, diagnostics, options);
}

// The zero-config element family, in the order the single function registered it.
function defaultSvgElementHandlers(): SvgElementHandlerEntry[] {
  return [
    { handle: svgContainerElementHandler, kind: SvgElementKind.Container },
    { handle: svgGeometryElementHandler, kind: SvgElementKind.Geometry },
    { handle: svgImageElementHandler, kind: SvgElementKind.Image },
    { handle: svgTextElementHandler, kind: SvgElementKind.Text },
    { handle: svgUseElementHandler, kind: SvgElementKind.Use },
  ];
}
