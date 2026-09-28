import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { registerDefaultShapeBoundsCommands } from '@flighthq/shape/contract';
import type {
  DisplayObject,
  Node2D,
  ImportDiagnostic,
  Matrix,
  SvgDocumentImportOptions,
  SvgImportContext,
  SvgRegistry,
  SvgStyle,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, SvgClipKind, SvgElementKind } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { parseSvgGradient } from './svgGradient.ts';
import { getSvgClipHandler, getSvgElementHandler } from './svgRegistry.ts';
import { collectCssRules, defaultSvgStyle, resolveSvgStyle } from './svgStyle.ts';
import { applySvgTransform, createSvgViewportMatrix, multiplySvgMatrices, parseSvgTransform } from './svgTransform.ts';
import { svgAttribute, svgLocalName, visitSvgElements } from './svgXml.ts';

export function appendSvgChildren(
  parent: DisplayObject,
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): void {
  for (const child of element.children) {
    const node = createSvgElementNode(child, parentStyle, context);
    if (node !== null) addNodeChild(parent, node);
  }
}

export function applySvgElementAppearance(
  target: Node2D,
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
  geometryTransform: Readonly<Matrix> | null = null,
  hasVisualDescendants = false,
): SvgStyle {
  const style = resolveSvgStyle(element, parentStyle, context);
  target.alpha = style.opacity;
  target.visible =
    style.display !== 'none' &&
    (hasVisualDescendants || (style.visibility !== 'hidden' && style.visibility !== 'collapse'));
  target.name = svgAttribute(element, 'id');
  if (style.filter !== 'none') {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'svg.unsupported-filter',
      'applySvgElementAppearance',
      { filter: style.filter },
    );
  }

  const authorTransform = parseSvgTransform(svgAttribute(element, 'transform'));
  const transform =
    authorTransform === null
      ? geometryTransform
      : geometryTransform === null
        ? authorTransform
        : multiplySvgMatrices(authorTransform, geometryTransform);
  applySvgTransform(target, transform);
  return style;
}

function svgElementKindForName(name: string): SvgElementKind | null {
  switch (name) {
    case 'a':
    case 'g':
    case 'svg':
    case 'switch':
      return SvgElementKind.Container;
    case 'circle':
    case 'ellipse':
    case 'line':
    case 'path':
    case 'polygon':
    case 'polyline':
    case 'rect':
      return SvgElementKind.Geometry;
    case 'image':
      return SvgElementKind.Image;
    case 'text':
      return SvgElementKind.Text;
    case 'use':
      return SvgElementKind.Use;
    default:
      return null;
  }
}

/**
 * Dispatches an element's clipping to the registered clip family.
 *
 * ★ THE CORE LOOKS UP AND NOTHING ELSE. It does not read `clip-path`, does not measure the target and does not touch
 * `@flighthq/clip` — the handler does all of that — so a caller who registers no clip family links none of it, and an
 * element that would have been clipped is simply not. Every element is offered, because in SVG every element may carry
 * a clip.
 */
export function applySvgElementClipFamily(
  target: Node2D,
  element: Readonly<XmlElement>,
  context: SvgImportContext,
): void {
  const handler = getSvgClipHandler(context.registry, SvgClipKind.Path);
  if (handler !== null) handler({ element, import: context, target });
}

/**
 * The document core: XML validation, the import context, the ordered element walk, and the shared plumbing every
 * family reads.
 *
 * ★ IT TAKES THE REGISTRY AND NAMES NO DEFAULT. Five element interpretations used to live in this file; each now lives
 * in the module that owns it, and what is left is what more than one of them needs — the walk, the appearance pass, the
 * dispatch vocabulary, definition indexing and the unsupported-element reports. Resolving `undefined` to the full
 * family happens in `svgImport.ts`, so nothing here reaches a preset.
 */
export function createScene2DFromSvgDocumentWithRegistry(
  source: string,
  registry: Readonly<SvgRegistry>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<SvgDocumentImportOptions>,
): DisplayObject {
  const out = createDisplayObject();
  const document = parseXmlDocument(source);
  if (document === null || svgLocalName(document.name) !== 'svg') {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'svg.invalid-document',
      'createScene2DFromSvgDocument',
    );
    return out;
  }

  registerDefaultShapeBoundsCommands();

  const context: SvgImportContext = {
    cssRules: collectCssRules(document),
    diagnostics,
    elementsById: new Map(),
    gradientsById: new Map(),
    objectBoundingBoxes: new Map(),
    options,
    parentByElement: new Map(),
    registry,
    reportedUnsupportedElements: new Set(),
    resolvedDefinitionStyles: new Map(),
    resolvingClipUses: new Set(),
    resolvingClips: new Set(),
    resolvingGradients: new Set(),
    resolvingUses: new Set(),
  };
  indexSvgDefinitions(document, context);

  const viewport = createSvgViewportMatrix(document);
  const rootStyle = applySvgElementAppearance(out, document, defaultSvgStyle, context, viewport, true);
  appendSvgChildren(out, document, rootStyle, context);
  applySvgElementClipFamily(out, document, context);
  reportRemainingUnsupportedSvgElements(document, context);
  return out;
}

export function createSvgElementNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D | null {
  const name = svgLocalName(element.name);
  if (name === 'defs' || name === 'style' || name === 'title' || name === 'desc' || name === 'metadata') return null;
  if (
    name === 'linearGradient' ||
    name === 'radialGradient' ||
    name === 'clipPath' ||
    name === 'mask' ||
    name === 'symbol'
  ) {
    return null;
  }

  const kind = svgElementKindForName(name);
  if (kind !== null) {
    const handler = getSvgElementHandler(context.registry, kind);
    if (handler !== null) return handler({ element, import: context, parentStyle });
  }

  if (isUnsupportedSvgElementName(name)) reportUnsupportedSvgElement(element, context, 'createSvgElementNode');
  else
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'svg.unknown-element',
      'createSvgElementNode',
      { element: name },
    );
  return null;
}

function indexSvgDefinitions(root: Readonly<XmlElement>, context: SvgImportContext): void {
  const indexElement = (element: Readonly<XmlElement>, parent: Readonly<XmlElement> | null): void => {
    context.parentByElement.set(element, parent);
    const id = svgAttribute(element, 'id');
    if (id !== null) context.elementsById.set(id, element);
    for (const child of element.children) indexElement(child, element);
  };
  indexElement(root, null);
  visitSvgElements(root, (element) => {
    const name = svgLocalName(element.name);
    const id = svgAttribute(element, 'id');
    if (id !== null && (name === 'linearGradient' || name === 'radialGradient')) {
      const gradient = parseSvgGradient(element, context);
      if (gradient !== null) context.gradientsById.set(id, gradient);
    }
  });
}

export function reportRemainingUnsupportedSvgElements(
  element: Readonly<XmlElement>,
  context: SvgImportContext,
  insideDefinitions = false,
): void {
  const name = svgLocalName(element.name);
  const definitions = insideDefinitions || name === 'defs';
  if (!definitions && isUnsupportedSvgElementName(name)) {
    reportUnsupportedSvgElement(element, context, 'reportRemainingUnsupportedSvgElements');
  }
  for (const child of element.children) reportRemainingUnsupportedSvgElements(child, context, definitions);
}

function reportUnsupportedSvgElement(element: Readonly<XmlElement>, context: SvgImportContext, origin: string): void {
  if (context.reportedUnsupportedElements.has(element)) return;
  context.reportedUnsupportedElements.add(element);
  const name = svgLocalName(element.name);
  reportImportDiagnostic(context.diagnostics, ImportDiagnosticSeverity.Skip, `svg.unsupported-${name}`, origin, {
    element: name,
  });
}

function isUnsupportedSvgElementName(name: string): boolean {
  return (
    name === 'animate' ||
    name === 'animateMotion' ||
    name === 'animateTransform' ||
    name === 'filter' ||
    name === 'foreignObject' ||
    name === 'pattern' ||
    name === 'script' ||
    name === 'set'
  );
}
