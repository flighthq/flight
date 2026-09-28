import { createMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  DisplayObject,
  Node2D,
  SvgElementContext,
  SvgImportContext,
  SvgStyle,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { applySvgElementClipFamily } from './svgDocument.ts';
import {
  appendSvgChildren,
  applySvgElementAppearance,
  createSvgElementNode,
  reportRemainingUnsupportedSvgElements,
} from './svgDocument.ts';
import { createSvgViewportMatrix } from './svgTransform.ts';
import { svgAttribute, svgLocalName, svgNumberAttribute, svgOptionalNumberAttribute } from './svgXml.ts';

/**
 * The `<use>` element, and the `<symbol>` it may reference.
 *
 * ★ THE ONE FAMILY THAT INSTANTIATES ANOTHER ELEMENT, so it re-enters the dispatch rather than the walk: whatever the
 * href names is read by whichever family claims it, which means a `use` pointing at a `<text>` produces nothing in a
 * build with no text family — correctly, since nothing registered can read it.
 *
 * The recursion guard is by id: `<use href="#a">` inside the element with id `a` is rejected rather than followed.
 */
export function svgUseElementHandler(context: SvgElementContext): Node2D | null {
  return createSvgUseNode(context.element, context.parentStyle, context.import);
}

function createSvgUseNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D | null {
  const href = svgAttribute(element, 'href');
  const id = href?.startsWith('#') === true ? href.slice(1) : null;
  if (id === null || context.resolvingUses.has(id)) {
    reportImportDiagnostic(
      context.diagnostics,
      id === null ? ImportDiagnosticSeverity.Drop : ImportDiagnosticSeverity.Reject,
      id === null ? 'svg.unresolved-use' : 'svg.recursive-use',
      'createSvgUseNode',
      id === null ? undefined : { id },
    );
    return null;
  }
  const referenced = context.elementsById.get(id);
  if (referenced === undefined) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'svg.unresolved-use',
      'createSvgUseNode',
      { id },
    );
    return null;
  }

  context.resolvingUses.add(id);
  reportRemainingUnsupportedSvgElements(referenced, context);
  const container = createDisplayObject();
  const placement = createMatrix(1, 0, 0, 1, svgNumberAttribute(element, 'x', 0), svgNumberAttribute(element, 'y', 0));
  const style = applySvgElementAppearance(container, element, parentStyle, context, placement, true);
  const referencedNode =
    svgLocalName(referenced.name) === 'symbol'
      ? createSvgSymbolNode(referenced, element, style, context)
      : createSvgElementNode(referenced, style, context);
  if (referencedNode !== null) addNodeChild(container, referencedNode);
  applySvgElementClipFamily(container, element, context);
  context.resolvingUses.delete(id);
  return container;
}

function createSvgSymbolNode(
  element: Readonly<XmlElement>,
  useElement: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): DisplayObject {
  const container = createDisplayObject({ name: svgAttribute(element, 'id') });
  const useWidth = svgOptionalNumberAttribute(useElement, 'width');
  const useHeight = svgOptionalNumberAttribute(useElement, 'height');
  const viewport = createSvgViewportMatrix(element, {
    height: useHeight ?? undefined,
    width: useWidth ?? undefined,
    x: 0,
    y: 0,
  });
  const style = applySvgElementAppearance(container, element, parentStyle, context, viewport, true);
  appendSvgChildren(container, element, style, context);
  applySvgElementClipFamily(container, element, context);
  return container;
}
