import {
  createClipRegionFromPath,
  intersectClipRegions,
  transformClipRegion,
  unionClipRegions,
} from '@flighthq/clip/contract';
import { packColor } from '@flighthq/color/contract';
import {
  createGradientTransformMatrix,
  createMatrix,
  createRectangle,
  createTransform2D,
  decomposeMatrixToTransform2D,
  matrixTransformRectangle,
  multiplyMatrix,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  addNodeChild,
  getNodeChildAt,
  getNodeChildCount,
  getNodeLocalBoundsRectangle,
  getNodeLocalMatrix,
} from '@flighthq/node/contract';
import { parseSvgPathData } from '@flighthq/path-formats/contract';
import {
  appendPathCircle,
  appendPathEllipse,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathPolygon,
  appendPathPolyline,
  appendPathRectangle,
  appendPathRoundRectangle,
  createPath,
  dashPath,
  getPathBounds,
  transformPath,
} from '@flighthq/path/contract';
import { createSprite, createDisplayObject } from '@flighthq/scene2d/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapePath,
  createShape,
} from '@flighthq/shape/contract';
import { createRichText, createTextLabel } from '@flighthq/text/contract';
import { createTextFormatRange } from '@flighthq/textlayout/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  ClipRegion,
  DisplayObject,
  Node2D,
  ImportDiagnostic,
  Matrix,
  Path,
  PathWinding,
  Rectangle,
  Shape,
  SpreadMethod,
  SvgDocumentImportOptions,
  TextFormat,
  TextFormatRange,
  Transform2D,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RichTextKind, TextLabelKind } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

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
  const out = createDisplayObject();
  const document = parseXmlDocument(source);
  if (document === null || localName(document.name) !== 'svg') {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'svg.invalid-document',
      'createScene2DFromSvgDocument',
    );
    return out;
  }

  const context: SvgImportContext = {
    cssRules: collectCssRules(document),
    diagnostics,
    elementsById: new Map(),
    gradientsById: new Map(),
    options,
    parentByElement: new Map(),
    reportedUnsupportedElements: new Set(),
    resolvingClipUses: new Set(),
    resolvingClips: new Set(),
    resolvingGradients: new Set(),
    resolvingUses: new Set(),
    resolvedDefinitionStyles: new Map(),
  };
  indexSvgDefinitions(document, context);

  const viewport = createSvgViewportMatrix(document);
  const rootStyle = applySvgElementAppearance(out, document, defaultSvgStyle, context, viewport, true);
  appendSvgChildren(out, document, rootStyle, context);
  applySvgElementClip(out, document, context, createSvgNode2DBounds(out));
  reportRemainingUnsupportedSvgElements(document, context);
  return out;
}

interface SvgColor {
  alpha: number;
  rgb: number;
}

interface SvgClipGeometry {
  path: Path | null;
  region: ClipRegion | null;
  winding: PathWinding;
}

interface SvgCssRule {
  declarations: Record<string, string>;
  order: number;
  selector: string;
  specificity: number;
}

interface SvgGradient {
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  kind: 'linear' | 'radial';
  units: 'objectBoundingBox' | 'userSpaceOnUse';
  spreadMethod: SpreadMethod;
  stops: SvgGradientStop[];
  transform: Matrix | null;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  radius: number;
}

interface SvgGradientStop {
  color: SvgColor;
  offset: number;
}

interface SvgImportContext {
  cssRules: SvgCssRule[];
  diagnostics: ImportDiagnostic[] | undefined;
  elementsById: Map<string, XmlElement>;
  gradientsById: Map<string, SvgGradient>;
  options: Readonly<SvgDocumentImportOptions> | undefined;
  parentByElement: Map<XmlElement, XmlElement | null>;
  reportedUnsupportedElements: Set<XmlElement>;
  resolvingClipUses: Set<string>;
  resolvingClips: Set<string>;
  resolvingGradients: Set<string>;
  resolvingUses: Set<string>;
  resolvedDefinitionStyles: Map<XmlElement, SvgStyle>;
}

interface SvgStyle {
  clipRule: PathWinding;
  color: string;
  display: string;
  fill: string;
  fillOpacity: number;
  fillRule: PathWinding;
  filter: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  fontWeight: string;
  opacity: number;
  stroke: string;
  strokeDasharray: string;
  strokeDashoffset: number;
  strokeLinecap: string;
  strokeLinejoin: string;
  strokeMiterlimit: number;
  strokeOpacity: number;
  strokeWidth: number;
  textAnchor: string;
  visibility: string;
}

interface SvgTextRun {
  opacity: number;
  style: Readonly<SvgStyle>;
  text: string;
}

const defaultSvgStyle: SvgStyle = {
  clipRule: 'nonZero',
  color: '#000000',
  display: 'inline',
  fill: '#000000',
  fillOpacity: 1,
  fillRule: 'nonZero',
  filter: 'none',
  fontFamily: 'sans-serif',
  fontSize: 16,
  fontStyle: 'normal',
  fontWeight: 'normal',
  opacity: 1,
  stroke: 'none',
  strokeDasharray: 'none',
  strokeDashoffset: 0,
  strokeLinecap: 'butt',
  strokeLinejoin: 'miter',
  strokeMiterlimit: 4,
  strokeOpacity: 1,
  strokeWidth: 1,
  textAnchor: 'start',
  visibility: 'visible',
};

function appendSvgChildren(
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

function applySvgElementAppearance(
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
  target.name = attribute(element, 'id');
  if (style.filter !== 'none') {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'svg.unsupported-filter',
      'applySvgElementAppearance',
      { filter: style.filter },
    );
  }

  const authorTransform = parseSvgTransform(attribute(element, 'transform'));
  const transform =
    authorTransform === null
      ? geometryTransform
      : geometryTransform === null
        ? authorTransform
        : multiplySvgMatrices(authorTransform, geometryTransform);
  applySvgTransform(target, transform);
  return style;
}

function applySvgElementClip(
  target: Node2D,
  element: Readonly<XmlElement>,
  context: SvgImportContext,
  targetBounds: Readonly<Rectangle> | null,
): void {
  const clipReference = parseUrlReference(attribute(element, 'clip-path'));
  const maskReference = parseUrlReference(attribute(element, 'mask'));
  const clipId = clipReference ?? maskReference;
  if (clipId === null) return;
  const clipElement = context.elementsById.get(clipId);
  if (clipElement === undefined) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'svg.unresolved-clip-reference',
      'applySvgElementClip',
      { id: clipId },
    );
    return;
  }
  if (usesSvgObjectBoundingBoxUnits(clipElement) && targetBounds === null) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'svg.object-bounding-box-clip-without-bounds',
      'applySvgElementClip',
      { id: clipId, reason: hasUnmeasurableSvgText(target) ? 'unmeasurable-text' : 'empty-geometry' },
    );
    return;
  }
  target.clip = createSvgClipRegion(clipElement, targetBounds, context);
  if (maskReference !== null) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Recover,
      'svg.mask-as-hard-clip',
      'applySvgElementClip',
      { id: maskReference },
    );
  }
}

function applySvgTransform(target: Node2D, matrix: Readonly<Matrix> | null): void {
  if (matrix === null) return;
  const transform = createTransform2D();
  decomposeMatrixToTransform2D(transform, matrix);
  assignSvgTransform(target, transform);
}

function assignSvgTransform(target: Node2D, transform: Readonly<Transform2D>): void {
  target.pivotX = transform.pivotX;
  target.pivotY = transform.pivotY;
  target.rotation = transform.rotation;
  target.scaleX = transform.scaleX;
  target.scaleY = transform.scaleY;
  target.skewX = transform.skewX;
  target.skewY = transform.skewY;
  target.x = transform.x;
  target.y = transform.y;
}

function attribute(element: Readonly<XmlElement>, name: string): string | null {
  return element.attributes[name] ?? element.attributes[`xlink:${name}`] ?? null;
}

function collectCssRules(root: Readonly<XmlElement>): SvgCssRule[] {
  const rules: SvgCssRule[] = [];
  visitXmlElements(root, (element) => {
    if (localName(element.name) !== 'style') return;
    const text = element.text.replace(/\/\*[\s\S]*?\*\//g, '');
    const expression = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text)) !== null) {
      const declarations = parseStyleDeclarations(match[2]);
      for (const selectorText of match[1].split(',')) {
        const selector = selectorText.trim();
        if (selector === '' || /[\s>+~:[\]]/.test(selector)) continue;
        rules.push({ declarations, order: rules.length, selector, specificity: getCssSelectorSpecificity(selector) });
      }
    }
  });
  return rules;
}

// Why `createSvgNode2DBounds` could not measure a subtree. The clip path reports this alongside the drop so
// a caller can tell OUR unimplemented measurement from THEIR empty geometry — today both surface as "your
// clip was dropped", which is the same sentence for a file that is wrong and a file we cannot yet handle.
//
// Text is genuinely UNMEASURABLE here, not merely unmeasured: this importer performs no text layout, so a
// subtree containing text has an UNKNOWN bounding box rather than a known one missing a piece. That is why
// the null propagates instead of unioning the measurable children — a box computed from the rest would be
// confidently too small, and a clip placed from it would be silently wrong rather than loudly absent.
function hasUnmeasurableSvgText(target: Node2D): boolean {
  if (target.kind === TextLabelKind || target.kind === RichTextKind) return true;
  const childCount = getNodeChildCount(target);
  for (let index = 0; index < childCount; index++) {
    const child = getNodeChildAt(target, index) as Node2D | null;
    if (child !== null && hasUnmeasurableSvgText(child)) return true;
  }
  return false;
}

function createSvgNode2DBounds(target: Node2D): Rectangle | null {
  if (target.kind === TextLabelKind || target.kind === RichTextKind) return null;
  const out = createRectangle();
  let hasBounds = copyNonEmptySvgBounds(out, getNodeLocalBoundsRectangle(target), false);
  let hasUnresolvedChildBounds = false;
  const childCount = getNodeChildCount(target);
  for (let index = 0; index < childCount; index++) {
    const child = getNodeChildAt(target, index) as Node2D | null;
    if (child === null) continue;
    const childBounds = createSvgNode2DBounds(child);
    if (childBounds === null) {
      hasUnresolvedChildBounds = true;
      continue;
    }
    const bounds = createRectangle();
    matrixTransformRectangle(bounds, getNodeLocalMatrix(child), childBounds);
    hasBounds = copyNonEmptySvgBounds(out, bounds, hasBounds);
  }
  return hasBounds && !hasUnresolvedChildBounds ? out : null;
}

function createSvgClipRegion(
  element: Readonly<XmlElement>,
  targetBounds: Readonly<Rectangle> | null,
  context: SvgImportContext,
): ClipRegion {
  const clipStyle = resolveSvgDefinitionStyle(element, context);
  const out = createPath(clipStyle.clipRule);
  const geometries: SvgClipGeometry[] = [];
  collectSvgClipGeometry(element, clipStyle, null, context, geometries);
  let winding: PathWinding | null = null;
  let mixedWindingReported = false;
  const clippedRegions: ClipRegion[] = [];
  for (const geometry of geometries) {
    if (winding === null) {
      winding = geometry.winding;
      out.winding = winding;
    } else if (geometry.winding !== winding && !mixedWindingReported) {
      mixedWindingReported = true;
      reportImportDiagnostic(
        context.diagnostics,
        ImportDiagnosticSeverity.Recover,
        'svg.mixed-clip-rule',
        'createSvgClipRegion',
        { id: attribute(element, 'id') ?? '' },
      );
    }
    if (geometry.path !== null) appendPathData(out, geometry.path);
    if (geometry.region !== null) clippedRegions.push(geometry.region);
  }
  let region = createClipRegionFromPath(out);
  for (const clippedRegion of clippedRegions) {
    if (out.commands.length === 0 && region.rect.width === 0 && region.rect.height === 0) region = clippedRegion;
    else unionClipRegions(region, region, clippedRegion);
  }
  region = intersectSvgClipReference(region, element, null, context);
  let transform = parseSvgTransform(attribute(element, 'transform'));
  const unitsAttribute =
    localName(element.name) === 'mask' ? attribute(element, 'maskContentUnits') : attribute(element, 'clipPathUnits');
  if (unitsAttribute === 'objectBoundingBox' && targetBounds !== null) {
    const unitTransform = createMatrix(targetBounds.width, 0, 0, targetBounds.height, targetBounds.x, targetBounds.y);
    transform = transform === null ? unitTransform : multiplySvgMatrices(unitTransform, transform);
  }
  if (transform === null) return region;
  transformClipRegion(region, region, transform);
  return region;
}

function collectSvgClipGeometry(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  parentTransform: Readonly<Matrix> | null,
  context: SvgImportContext,
  out: SvgClipGeometry[],
): void {
  for (const child of element.children) {
    collectSvgClipGeometryElement(child, parentStyle, parentTransform, context, out);
  }
}

function collectSvgClipGeometryElement(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  parentTransform: Readonly<Matrix> | null,
  context: SvgImportContext,
  out: SvgClipGeometry[],
  viewportElement?: Readonly<XmlElement>,
): void {
  const style = resolveSvgStyle(element, parentStyle, context);
  if (style.display === 'none') return;
  const name = localName(element.name);
  let geometryTransform: Matrix | null = null;
  if (name === 'use') {
    geometryTransform = createMatrix(1, 0, 0, 1, numberAttribute(element, 'x', 0), numberAttribute(element, 'y', 0));
  } else if (name === 'svg') {
    geometryTransform = createSvgViewportMatrix(element);
  } else if (name === 'symbol' && viewportElement !== undefined) {
    geometryTransform = createSvgViewportMatrix(element, {
      height: optionalNumberAttribute(viewportElement, 'height') ?? undefined,
      width: optionalNumberAttribute(viewportElement, 'width') ?? undefined,
      x: 0,
      y: 0,
    });
  }
  const authorTransform = parseSvgTransform(attribute(element, 'transform'));
  const localTransform =
    authorTransform === null
      ? geometryTransform
      : geometryTransform === null
        ? authorTransform
        : multiplySvgMatrices(authorTransform, geometryTransform);
  const transform =
    parentTransform === null
      ? localTransform
      : localTransform === null
        ? parentTransform
        : multiplySvgMatrices(parentTransform, localTransform);

  if (name === 'use') {
    collectSvgClipUseGeometry(element, style, transform, context, out);
    return;
  }

  const path = createSvgGeometryPath(element, style.clipRule);
  if (path !== null) {
    if (style.visibility !== 'visible') return;
    let transformedPath = path;
    if (transform !== null) {
      const transformed = createPath(path.winding);
      transformPath(path, transform, transformed);
      transformedPath = transformed;
    }
    if (parseUrlReference(attribute(element, 'clip-path')) === null) {
      out.push({ path: transformedPath, region: null, winding: path.winding });
    } else {
      const region = intersectSvgClipReference(createClipRegionFromPath(transformedPath), element, transform, context);
      out.push({ path: null, region, winding: region.winding });
    }
    return;
  }
  if (name === 'a' || name === 'g' || name === 'svg' || name === 'switch' || name === 'symbol') {
    const start = out.length;
    collectSvgClipGeometry(element, style, transform, context, out);
    if (parseUrlReference(attribute(element, 'clip-path')) !== null) {
      for (let index = start; index < out.length; index++) {
        const geometry = out[index];
        const region = geometry.region ?? createClipRegionFromPath(geometry.path!);
        geometry.path = null;
        geometry.region = intersectSvgClipReference(region, element, transform, context);
        geometry.winding = geometry.region.winding;
      }
    }
    return;
  }
  if (name === 'text') {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'svg.unsupported-clip-text',
      'collectSvgClipGeometryElement',
      { element: name },
    );
  }
}

function intersectSvgClipReference(
  base: ClipRegion,
  element: Readonly<XmlElement>,
  transform: Readonly<Matrix> | null,
  context: SvgImportContext,
): ClipRegion {
  const id = parseUrlReference(attribute(element, 'clip-path'));
  if (id === null) return base;
  const referenced = context.elementsById.get(id);
  if (referenced === undefined || context.resolvingClips.has(id)) {
    reportImportDiagnostic(
      context.diagnostics,
      context.resolvingClips.has(id) ? ImportDiagnosticSeverity.Reject : ImportDiagnosticSeverity.Drop,
      'svg.unresolved-clip-reference',
      'intersectSvgClipReference',
      { id },
    );
    return base;
  }
  if (transform !== null && usesSvgObjectBoundingBoxUnits(referenced)) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'svg.clip-nested-intersection-unsupported',
      'intersectSvgClipReference',
      { id, reason: 'transformed-object-bounding-box-target' },
    );
    return base;
  }
  context.resolvingClips.add(id);
  const referencedRegion = createSvgClipRegion(referenced, base.rect, context);
  context.resolvingClips.delete(id);
  if (transform !== null) transformClipRegion(referencedRegion, referencedRegion, transform);
  intersectClipRegions(base, base, referencedRegion);
  return base;
}

function collectSvgClipUseGeometry(
  element: Readonly<XmlElement>,
  style: Readonly<SvgStyle>,
  transform: Readonly<Matrix> | null,
  context: SvgImportContext,
  out: SvgClipGeometry[],
): void {
  const href = attribute(element, 'href');
  const id = href?.startsWith('#') === true ? href.slice(1) : null;
  if (id === null || context.resolvingClipUses.has(id)) {
    reportImportDiagnostic(
      context.diagnostics,
      id === null ? ImportDiagnosticSeverity.Drop : ImportDiagnosticSeverity.Reject,
      id === null ? 'svg.unresolved-use' : 'svg.recursive-use',
      'collectSvgClipUseGeometry',
      id === null ? undefined : { id },
    );
    return;
  }
  const referenced = context.elementsById.get(id);
  if (referenced === undefined) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'svg.unresolved-use',
      'collectSvgClipUseGeometry',
      { id },
    );
    return;
  }
  context.resolvingClipUses.add(id);
  collectSvgClipGeometryElement(referenced, style, transform, context, out, element);
  context.resolvingClipUses.delete(id);
}

function copyNonEmptySvgBounds(out: Rectangle, source: Readonly<Rectangle>, hasBounds: boolean): boolean {
  if (source.width === 0 || source.height === 0) return hasBounds;
  if (!hasBounds) {
    out.x = source.x;
    out.y = source.y;
    out.width = source.width;
    out.height = source.height;
    return true;
  }
  const minimumX = Math.min(out.x, source.x);
  const minimumY = Math.min(out.y, source.y);
  const maximumX = Math.max(out.x + out.width, source.x + source.width);
  const maximumY = Math.max(out.y + out.height, source.y + source.height);
  out.x = minimumX;
  out.y = minimumY;
  out.width = maximumX - minimumX;
  out.height = maximumY - minimumY;
  return true;
}

function createSvgElementNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D | null {
  const name = localName(element.name);
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

  if (name === 'g' || name === 'a' || name === 'switch' || name === 'svg') {
    const container = createDisplayObject();
    const viewport = name === 'svg' ? createSvgViewportMatrix(element) : null;
    const style = applySvgElementAppearance(container, element, parentStyle, context, viewport, true);
    appendSvgChildren(container, element, style, context);
    applySvgElementClip(container, element, context, createSvgNode2DBounds(container));
    return container;
  }

  if (name === 'use') return createSvgUseNode(element, parentStyle, context);
  if (name === 'text') return createSvgTextNode(element, parentStyle, context);
  if (name === 'image') return createSvgImageNode(element, parentStyle, context);

  const style = resolveSvgStyle(element, parentStyle, context);
  const path = createSvgGeometryPath(element, style.fillRule);
  if (path !== null) {
    const shape = createShape();
    applySvgElementAppearance(shape, element, parentStyle, context);
    appendSvgShapePaint(shape, path, style, element, context);
    const bounds = createRectangle();
    getPathBounds(path, bounds);
    applySvgElementClip(shape, element, context, bounds);
    return shape;
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

function createSvgImageNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D | null {
  const href = attribute(element, 'href');
  const image = href === null ? null : (context.options?.resolveImageResource?.(href) ?? null);
  if (href === null || image === null) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      href === null ? 'svg.image-missing-href' : 'svg.unresolved-image',
      'createSvgImageNode',
      href === null ? undefined : { href },
    );
    return null;
  }

  const width = numberAttribute(element, 'width', image.width);
  const height = numberAttribute(element, 'height', image.height);
  const x = numberAttribute(element, 'x', 0);
  const y = numberAttribute(element, 'y', 0);
  const bitmap = createSprite({
    data: { texture: createTexture({ dimension: '2d', source: image }) },
  });
  const geometry =
    image.width > 0 && image.height > 0 && width >= 0 && height >= 0
      ? createSvgViewBoxMatrix(
          [0, 0, image.width, image.height],
          { height, width, x, y },
          attribute(element, 'preserveAspectRatio') ?? 'xMidYMid meet',
        )
      : createMatrix(1, 0, 0, 1, x, y);
  applySvgElementAppearance(bitmap, element, parentStyle, context, geometry);
  const bounds = createRectangle(0, 0, image.width, image.height);
  applySvgElementClip(bitmap, element, context, bounds);
  return bitmap;
}

function createSvgGeometryPath(element: Readonly<XmlElement>, winding: PathWinding): Path | null {
  const name = localName(element.name);
  if (name === 'path') {
    const path = parseSvgPathData(attribute(element, 'd') ?? '');
    if (path !== null) path.winding = winding;
    return path;
  }

  const path = createPath(winding);
  if (name === 'rect') {
    const x = numberAttribute(element, 'x', 0);
    const y = numberAttribute(element, 'y', 0);
    const width = numberAttribute(element, 'width', 0);
    const height = numberAttribute(element, 'height', 0);
    const rx = Math.max(0, numberAttribute(element, 'rx', 0));
    const ry = Math.max(0, numberAttribute(element, 'ry', rx));
    if (width <= 0 || height <= 0) return path;
    if (rx > 0 || ry > 0)
      appendPathRoundRectangle(path, x, y, width, height, Math.min(Math.max(rx, ry), width / 2, height / 2));
    else appendPathRectangle(path, x, y, width, height);
    return path;
  }
  if (name === 'circle') {
    appendPathCircle(
      path,
      numberAttribute(element, 'cx', 0),
      numberAttribute(element, 'cy', 0),
      Math.max(0, numberAttribute(element, 'r', 0)),
    );
    return path;
  }
  if (name === 'ellipse') {
    appendPathEllipse(
      path,
      numberAttribute(element, 'cx', 0),
      numberAttribute(element, 'cy', 0),
      Math.max(0, numberAttribute(element, 'rx', 0)),
      Math.max(0, numberAttribute(element, 'ry', 0)),
    );
    return path;
  }
  if (name === 'line') {
    appendPathMoveTo(path, numberAttribute(element, 'x1', 0), numberAttribute(element, 'y1', 0));
    appendPathLineTo(path, numberAttribute(element, 'x2', 0), numberAttribute(element, 'y2', 0));
    return path;
  }
  if (name === 'polygon' || name === 'polyline') {
    const points = parseSvgNumberList(attribute(element, 'points') ?? '');
    if (name === 'polygon') appendPathPolygon(path, points);
    else appendPathPolyline(path, points);
    return path;
  }
  return null;
}

function createSvgTextNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D {
  const style = resolveSvgStyle(element, parentStyle, context);
  const format = createSvgTextFormat(style);
  const directTspans = element.children.filter((child) => localName(child.name) === 'tspan');
  const tspans = collectSvgTspanElements(element);
  const runs: SvgTextRun[] = [];
  collectSvgTextRuns(element, style, context, runs);
  const lastRun = runs[runs.length - 1];
  if (lastRun !== undefined) lastRun.text = lastRun.text.trimEnd();
  const text = runs.map((run) => run.text).join('');
  const ranges: TextFormatRange[] = [];
  let offset = 0;
  for (const run of runs) {
    const end = offset + run.text.length;
    if (run.style !== style) {
      ranges.push(createTextFormatRange(createSvgTextFormat(run.style, run.opacity), offset, end));
    }
    offset = end;
  }
  const firstTspan = directTspans[0];
  const xElement = attribute(element, 'x') === null && firstTspan !== undefined ? firstTspan : element;
  const yElement = attribute(element, 'y') === null && firstTspan !== undefined ? firstTspan : element;
  const x =
    firstNumber(attribute(xElement, 'x'), 0) +
    firstNumber(attribute(element, 'dx'), 0) +
    (xElement === element ? 0 : firstNumber(attribute(xElement, 'dx'), 0));
  const y =
    firstNumber(attribute(yElement, 'y'), 0) +
    firstNumber(attribute(element, 'dy'), 0) +
    (yElement === element ? 0 : firstNumber(attribute(yElement, 'dy'), 0)) -
    style.fontSize;
  const common = {
    alpha: style.opacity,
    name: attribute(element, 'id'),
    visible: style.display !== 'none' && style.visibility === 'visible',
  };
  const label =
    ranges.length === 0
      ? createTextLabel({
          ...common,
          data: { autoSize: 'left', height: style.fontSize * 1.25, text, textFormat: format, width: 10000 },
        })
      : createRichText({
          ...common,
          data: {
            autoSize: 'left',
            defaultTextFormat: format,
            height: style.fontSize * 1.25,
            text,
            textFormat: format,
            textFormatRanges: ranges,
            width: 10000,
          },
        });
  if (hasFlattenedSvgTextPosition(tspans, firstTspan)) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Recover,
      'svg.tspan-position-flattened',
      'createSvgTextNode',
      { count: tspans.length },
    );
  }
  applySvgElementAppearance(label, element, parentStyle, context, createMatrix(1, 0, 0, 1, x, y));
  applySvgElementClip(label, element, context, null);
  return label;
}

function createSvgTextFormat(style: Readonly<SvgStyle>, opacity = 1): TextFormat {
  const color = resolveSvgColor(style.fill, style.color) ?? { alpha: 0, rgb: 0 };
  return {
    align: style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left',
    bold: style.fontWeight === 'bold' || Number(style.fontWeight) >= 600,
    color: packColor(
      ((color.rgb >>> 16) & 0xff) / 255,
      ((color.rgb >>> 8) & 0xff) / 255,
      (color.rgb & 0xff) / 255,
      color.alpha * style.fillOpacity * opacity,
    ),
    font: style.fontFamily.replace(/^['"]|['"]$/g, ''),
    italic: style.fontStyle === 'italic' || style.fontStyle === 'oblique',
    size: style.fontSize,
  };
}

function createSvgUseNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D | null {
  const href = attribute(element, 'href');
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
  const placement = createMatrix(1, 0, 0, 1, numberAttribute(element, 'x', 0), numberAttribute(element, 'y', 0));
  const style = applySvgElementAppearance(container, element, parentStyle, context, placement, true);
  const referencedNode =
    localName(referenced.name) === 'symbol'
      ? createSvgSymbolNode(referenced, element, style, context)
      : createSvgElementNode(referenced, style, context);
  if (referencedNode !== null) addNodeChild(container, referencedNode);
  applySvgElementClip(container, element, context, createSvgNode2DBounds(container));
  context.resolvingUses.delete(id);
  return container;
}

function createSvgSymbolNode(
  element: Readonly<XmlElement>,
  useElement: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): DisplayObject {
  const container = createDisplayObject({ name: attribute(element, 'id') });
  const useWidth = optionalNumberAttribute(useElement, 'width');
  const useHeight = optionalNumberAttribute(useElement, 'height');
  const viewport = createSvgViewportMatrix(element, {
    height: useHeight ?? undefined,
    width: useWidth ?? undefined,
    x: 0,
    y: 0,
  });
  const style = applySvgElementAppearance(container, element, parentStyle, context, viewport, true);
  appendSvgChildren(container, element, style, context);
  applySvgElementClip(container, element, context, createSvgNode2DBounds(container));
  return container;
}

function appendSvgShapePaint(
  shape: Shape,
  path: Readonly<Path>,
  style: Readonly<SvgStyle>,
  element: Readonly<XmlElement>,
  context: SvgImportContext,
): void {
  const fillGradient = resolveSvgGradient(style.fill, context);
  const fillColor = resolveSvgColor(style.fill, style.color);
  if (fillGradient !== null) {
    appendShapeBeginGradientFill(
      shape,
      fillGradient.kind,
      fillGradient.stops.map((stop) => stop.color.rgb),
      fillGradient.stops.map((stop) => stop.color.alpha * style.fillOpacity),
      fillGradient.stops.map((stop) => Math.round(stop.offset * 255)),
      createSvgGradientMatrix(fillGradient, path, context),
      fillGradient.spreadMethod,
    );
  } else if (fillColor !== null) {
    appendShapeBeginFill(shape, fillColor.rgb, fillColor.alpha * style.fillOpacity);
  }
  if (fillGradient !== null || fillColor !== null) {
    appendShapePath(shape, path.commands.slice(), path.data.slice(), path.winding);
    appendShapeEndFill(shape);
  } else if (parseUrlReference(style.fill) !== null) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'svg.unresolved-fill-gradient',
      'appendSvgShapePaint',
      { element: localName(element.name) },
    );
  }

  const strokeGradient = resolveSvgGradient(style.stroke, context);
  const strokeColor = resolveSvgColor(style.stroke, style.color);
  if (strokeGradient === null && strokeColor === null) {
    if (parseUrlReference(style.stroke) !== null) {
      reportImportDiagnostic(
        context.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'svg.unresolved-stroke-gradient',
        'appendSvgShapePaint',
        { element: localName(element.name) },
      );
    }
    return;
  }

  appendShapeLineStyle(
    shape,
    style.strokeWidth,
    strokeColor?.rgb ?? 0,
    (strokeColor?.alpha ?? 1) * style.strokeOpacity,
    false,
    'normal',
    mapSvgLineCap(style.strokeLinecap),
    mapSvgLineJoin(style.strokeLinejoin),
    style.strokeMiterlimit,
  );
  if (strokeGradient !== null) {
    appendShapeLineGradientStyle(
      shape,
      strokeGradient.kind,
      strokeGradient.stops.map((stop) => stop.color.rgb),
      strokeGradient.stops.map((stop) => stop.color.alpha * style.strokeOpacity),
      strokeGradient.stops.map((stop) => Math.round(stop.offset * 255)),
      createSvgGradientMatrix(strokeGradient, path, context),
      strokeGradient.spreadMethod,
    );
  }
  let strokePath = path;
  if (style.strokeDasharray !== 'none') {
    const dash = parseSvgNumberList(style.strokeDasharray).filter((value) => value >= 0);
    if (dash.length > 0) {
      strokePath = createPath(path.winding);
      dashPath(path, dash.length % 2 === 0 ? dash : [...dash, ...dash], style.strokeDashoffset, strokePath);
    }
  }
  appendShapePath(shape, strokePath.commands.slice(), strokePath.data.slice(), strokePath.winding);
}

function appendPathData(out: Path, source: Readonly<Path>): void {
  out.commands.push(...source.commands);
  out.data.push(...source.data);
}

function collectSvgTextRuns(
  element: Readonly<XmlElement>,
  style: Readonly<SvgStyle>,
  context: Readonly<SvgImportContext>,
  out: SvgTextRun[],
  opacity = 1,
): void {
  if (style.display === 'none') return;
  for (const content of element.content) {
    if (typeof content === 'string') {
      if (style.visibility === 'visible') appendSvgTextRun(out, style, content, opacity);
      continue;
    }
    if (localName(content.name) !== 'tspan') continue;
    const childStyle = resolveSvgStyle(content, style, context);
    collectSvgTextRuns(content, childStyle, context, out, opacity * childStyle.opacity);
  }
}

function collectSvgTspanElements(element: Readonly<XmlElement>): XmlElement[] {
  const out: XmlElement[] = [];
  for (const child of element.children) {
    if (localName(child.name) === 'tspan') out.push(child);
    out.push(...collectSvgTspanElements(child));
  }
  return out;
}

function appendSvgTextRun(out: SvgTextRun[], style: Readonly<SvgStyle>, source: string, opacity: number): void {
  let text = source
    .replace(/[\n\r]/g, '')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ');
  if (out.length === 0) text = text.trimStart();
  const previous = out[out.length - 1];
  if (previous?.text.endsWith(' ') === true && text.startsWith(' ')) text = text.slice(1);
  if (text !== '') out.push({ opacity, style, text });
}

function createSvgGradientMatrix(
  gradient: Readonly<SvgGradient>,
  path: Readonly<Path>,
  context: SvgImportContext,
): Matrix {
  const bounds = createRectangle();
  getPathBounds(path, bounds);
  // objectBoundingBox scales by the box, so a zero-width or zero-height box collapses the gradient onto a
  // line or a point. The result is still a matrix and still renders, which is why this needed saying: the
  // clip path refuses the same situation loudly while this one used to proceed in silence, and one of the
  // two had to be wrong. Reported, not refused — what the correct rendering IS depends on a spec question
  // that is still open, and a diagnostic commits to nothing while silence commits to the current answer.
  if (gradient.units === 'objectBoundingBox' && (bounds.width === 0 || bounds.height === 0)) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Recover,
      'svg.object-bounding-box-gradient-without-bounds',
      'createSvgGradientMatrix',
      { height: bounds.height, kind: gradient.kind, width: bounds.width },
    );
  }
  const mapX = (value: number): number =>
    gradient.units === 'objectBoundingBox' ? bounds.x + value * bounds.width : value;
  const mapY = (value: number): number =>
    gradient.units === 'objectBoundingBox' ? bounds.y + value * bounds.height : value;
  let matrix: Matrix;
  if (gradient.kind === 'linear') {
    const x1 = mapX(gradient.x1);
    const y1 = mapY(gradient.y1);
    const x2 = mapX(gradient.x2);
    const y2 = mapY(gradient.y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.max(Math.hypot(dx, dy), 1);
    matrix = createGradientTransformMatrix(length, length, Math.atan2(dy, dx), (x1 + x2) / 2, (y1 + y2) / 2);
  } else {
    const radiusX = gradient.units === 'objectBoundingBox' ? gradient.radius * bounds.width : gradient.radius;
    const radiusY = gradient.units === 'objectBoundingBox' ? gradient.radius * bounds.height : gradient.radius;
    matrix = createGradientTransformMatrix(
      Math.max(radiusX * 2, 1),
      Math.max(radiusY * 2, 1),
      0,
      mapX(gradient.cx),
      mapY(gradient.cy),
    );
  }
  if (gradient.transform !== null) matrix = multiplySvgMatrices(gradient.transform, matrix);
  return matrix;
}

function createSvgViewportMatrix(
  element: Readonly<XmlElement>,
  viewport?: Readonly<{ height?: number; width?: number; x?: number; y?: number }>,
): Matrix | null {
  const x = viewport?.x ?? numberAttribute(element, 'x', 0);
  const y = viewport?.y ?? numberAttribute(element, 'y', 0);
  const viewBox = parseSvgNumberList(attribute(element, 'viewBox') ?? '');
  if (viewBox.length < 4) return x === 0 && y === 0 ? null : createMatrix(1, 0, 0, 1, x, y);
  const width = viewport?.width ?? parseSvgLength(attribute(element, 'width'), viewBox[2]);
  const height = viewport?.height ?? parseSvgLength(attribute(element, 'height'), viewBox[3]);
  return createSvgViewBoxMatrix(
    viewBox,
    { height, width, x, y },
    attribute(element, 'preserveAspectRatio') ?? 'xMidYMid meet',
  );
}

function createSvgViewBoxMatrix(
  viewBox: readonly number[],
  viewport: Readonly<{ height: number; width: number; x: number; y: number }>,
  preserveAspectRatioValue: string,
): Matrix {
  const { height, width, x, y } = viewport;
  let sx = viewBox[2] === 0 ? 1 : width / viewBox[2];
  let sy = viewBox[3] === 0 ? 1 : height / viewBox[3];
  const preserveAspectRatio = preserveAspectRatioValue.trim();
  if (preserveAspectRatio === 'none') {
    return createMatrix(sx, 0, 0, sy, x - viewBox[0] * sx, y - viewBox[1] * sy);
  }

  const parts = preserveAspectRatio.split(/\s+/);
  const alignment = parts[0] === 'defer' ? (parts[1] ?? 'xMidYMid') : parts[0];
  const mode = parts.includes('slice') ? 'slice' : 'meet';
  const uniformScale = mode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  sx = uniformScale;
  sy = uniformScale;
  const spareX = width - viewBox[2] * sx;
  const spareY = height - viewBox[3] * sy;
  const alignX = alignment.includes('xMax') ? spareX : alignment.includes('xMid') ? spareX / 2 : 0;
  const alignY = alignment.includes('YMax') ? spareY : alignment.includes('YMid') ? spareY / 2 : 0;
  return createMatrix(sx, 0, 0, sy, x + alignX - viewBox[0] * sx, y + alignY - viewBox[1] * sy);
}

function getCssSelectorSpecificity(selector: string): number {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+/g)?.length ?? 0;
  const hasType = /^[a-zA-Z_][\w-]*/.test(selector) ? 1 : 0;
  return ids * 100 + classes * 10 + hasType;
}

function indexSvgDefinitions(root: Readonly<XmlElement>, context: SvgImportContext): void {
  const indexElement = (element: Readonly<XmlElement>, parent: Readonly<XmlElement> | null): void => {
    context.parentByElement.set(element, parent);
    const id = attribute(element, 'id');
    if (id !== null) context.elementsById.set(id, element);
    for (const child of element.children) indexElement(child, element);
  };
  indexElement(root, null);
  visitXmlElements(root, (element) => {
    const name = localName(element.name);
    const id = attribute(element, 'id');
    if (id !== null && (name === 'linearGradient' || name === 'radialGradient')) {
      const gradient = parseSvgGradient(element, context);
      if (gradient !== null) context.gradientsById.set(id, gradient);
    }
  });
}

function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

function mapSvgLineCap(value: string): 'none' | 'round' | 'square' {
  return value === 'round' ? 'round' : value === 'square' ? 'square' : 'none';
}

function mapSvgLineJoin(value: string): 'bevel' | 'miter' | 'round' {
  return value === 'round' ? 'round' : value === 'bevel' ? 'bevel' : 'miter';
}

function matchesCssSelector(element: Readonly<XmlElement>, selector: string): boolean {
  if (selector.startsWith('#')) return attribute(element, 'id') === selector.slice(1);
  if (selector.startsWith('.')) {
    const classes = (attribute(element, 'class') ?? '').split(/\s+/);
    return classes.includes(selector.slice(1));
  }
  const [tag, className] = selector.split('.');
  return localName(element.name) === tag && (className === undefined || matchesCssSelector(element, `.${className}`));
}

function multiplySvgMatrices(a: Readonly<Matrix>, b: Readonly<Matrix>): Matrix {
  const out = createMatrix();
  multiplyMatrix(out, a, b);
  return out;
}

function numberAttribute(element: Readonly<XmlElement>, name: string, fallback: number): number {
  return parseSvgLength(attribute(element, name), fallback);
}

function optionalNumberAttribute(element: Readonly<XmlElement>, name: string): number | null {
  const value = attribute(element, name);
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCssNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseStyleDeclarations(value: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const part of value.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const name = part.slice(0, colon).trim();
    const propertyValue = part
      .slice(colon + 1)
      .trim()
      .replace(/\s*!important\s*$/, '');
    if (name !== '') declarations[name] = propertyValue;
  }
  return declarations;
}

function parseSvgColor(value: string): SvgColor | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'none' || normalized === 'transparent') return null;
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return Number.isNaN(r + g + b + a) ? null : { alpha: a, rgb: (r << 16) | (g << 8) | b };
    }
    if (hex.length === 6 || hex.length === 8) {
      const rgb = Number.parseInt(hex.slice(0, 6), 16);
      const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
      return Number.isNaN(rgb + alpha) ? null : { alpha, rgb };
    }
  }
  const functionMatch = /^(rgba?|hsla?)\((.*)\)$/.exec(normalized);
  if (functionMatch !== null) {
    const components = functionMatch[2].split(/[\s,/]+/).filter(Boolean);
    if ((functionMatch[1] === 'rgb' || functionMatch[1] === 'rgba') && components.length >= 3) {
      const component = (index: number): number => {
        const text = components[index];
        return text.endsWith('%') ? (Number.parseFloat(text) * 255) / 100 : Number.parseFloat(text);
      };
      const r = Math.round(clamp(component(0), 0, 255));
      const g = Math.round(clamp(component(1), 0, 255));
      const b = Math.round(clamp(component(2), 0, 255));
      const alpha = components[3] === undefined ? 1 : parseCssAlpha(components[3]);
      if (Number.isFinite(r + g + b + alpha)) return { alpha, rgb: (r << 16) | (g << 8) | b };
    }
    if ((functionMatch[1] === 'hsl' || functionMatch[1] === 'hsla') && components.length >= 3) {
      const hue = parseCssHue(components[0]);
      const saturation = parseCssFraction(components[1]);
      const lightness = parseCssFraction(components[2]);
      const alpha = components[3] === undefined ? 1 : parseCssAlpha(components[3]);
      if (Number.isFinite(hue + saturation + lightness + alpha)) {
        return { alpha, rgb: hslToRgb(hue, saturation, lightness) };
      }
    }
  }
  const named = svgNamedColors[normalized];
  return named === undefined ? null : { alpha: 1, rgb: named };
}

function parseSvgGradient(element: Readonly<XmlElement>, context: SvgImportContext): SvgGradient | null {
  const kind = localName(element.name) === 'linearGradient' ? 'linear' : 'radial';
  const href = attribute(element, 'href');
  const inheritedId = href?.startsWith('#') === true ? href.slice(1) : null;
  let inherited = inheritedId === null ? undefined : context.gradientsById.get(inheritedId);
  if (inherited === undefined && inheritedId !== null && !context.resolvingGradients.has(inheritedId)) {
    const inheritedElement = context.elementsById.get(inheritedId);
    if (
      inheritedElement !== undefined &&
      (localName(inheritedElement.name) === 'linearGradient' || localName(inheritedElement.name) === 'radialGradient')
    ) {
      context.resolvingGradients.add(inheritedId);
      inherited = parseSvgGradient(inheritedElement, context) ?? undefined;
      context.resolvingGradients.delete(inheritedId);
      if (inherited !== undefined) context.gradientsById.set(inheritedId, inherited);
    }
  }
  if (inheritedId !== null && inherited === undefined) {
    reportImportDiagnostic(
      context.diagnostics,
      context.resolvingGradients.has(inheritedId) ? ImportDiagnosticSeverity.Reject : ImportDiagnosticSeverity.Drop,
      context.resolvingGradients.has(inheritedId) ? 'svg.recursive-gradient' : 'svg.unresolved-gradient-reference',
      'parseSvgGradient',
      { id: inheritedId },
    );
  }
  const stops: SvgGradientStop[] = [];
  for (const child of element.children) {
    if (localName(child.name) !== 'stop') continue;
    const declarations = parseStyleDeclarations(attribute(child, 'style') ?? '');
    const color = resolveSvgColor(
      attribute(child, 'stop-color') ?? declarations['stop-color'] ?? '#000000',
      resolveSvgDefinitionStyle(child, context).color,
    );
    if (color === null) continue;
    color.alpha *= clamp(parseCssNumber(attribute(child, 'stop-opacity') ?? declarations['stop-opacity'], 1), 0, 1);
    stops.push({
      color,
      offset: clamp(parseSvgOffset(attribute(child, 'offset')), 0, 1),
    });
  }
  const resolvedStops =
    stops.length === 0
      ? (inherited?.stops.map((stop) => ({ color: { ...stop.color }, offset: stop.offset })) ?? [])
      : stops;
  if (resolvedStops.length === 0) return null;
  resolvedStops.sort((a, b) => a.offset - b.offset);
  return {
    cx: parseSvgCoordinate(attribute(element, 'cx'), inherited?.cx ?? 0.5),
    cy: parseSvgCoordinate(attribute(element, 'cy'), inherited?.cy ?? 0.5),
    fx: parseSvgCoordinate(attribute(element, 'fx'), inherited?.fx ?? 0.5),
    fy: parseSvgCoordinate(attribute(element, 'fy'), inherited?.fy ?? 0.5),
    kind,
    radius: parseSvgCoordinate(attribute(element, 'r'), inherited?.radius ?? 0.5),
    spreadMethod: parseSvgSpreadMethod(attribute(element, 'spreadMethod')) ?? inherited?.spreadMethod ?? 'pad',
    stops: resolvedStops,
    transform: parseSvgTransform(attribute(element, 'gradientTransform')) ?? inherited?.transform ?? null,
    units:
      attribute(element, 'gradientUnits') === 'userSpaceOnUse'
        ? 'userSpaceOnUse'
        : (inherited?.units ?? 'objectBoundingBox'),
    x1: parseSvgCoordinate(attribute(element, 'x1'), inherited?.x1 ?? 0),
    x2: parseSvgCoordinate(attribute(element, 'x2'), inherited?.x2 ?? 1),
    y1: parseSvgCoordinate(attribute(element, 'y1'), inherited?.y1 ?? 0),
    y2: parseSvgCoordinate(attribute(element, 'y2'), inherited?.y2 ?? 0),
  };
}

function parseSvgCoordinate(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return value.trim().endsWith('%') ? parsed / 100 : parsed;
}

function parseCssAlpha(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return clamp(value.endsWith('%') ? parsed / 100 : parsed, 0, 1);
}

function parseCssFraction(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return clamp(value.endsWith('%') ? parsed / 100 : parsed, 0, 1);
}

function parseCssHue(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  if (value.endsWith('turn')) return parsed * 360;
  if (value.endsWith('grad')) return parsed * 0.9;
  if (value.endsWith('rad')) return (parsed * 180) / Math.PI;
  return parsed;
}

function hslToRgb(hue: number, saturation: number, lightness: number): number {
  const normalizedHue = (((hue % 360) + 360) % 360) / 60;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((normalizedHue % 2) - 1));
  const [red, green, blue] =
    normalizedHue < 1
      ? [chroma, secondary, 0]
      : normalizedHue < 2
        ? [secondary, chroma, 0]
        : normalizedHue < 3
          ? [0, chroma, secondary]
          : normalizedHue < 4
            ? [0, secondary, chroma]
            : normalizedHue < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return (
    (Math.round((red + offset) * 255) << 16) |
    (Math.round((green + offset) * 255) << 8) |
    Math.round((blue + offset) * 255)
  );
}

function parseSvgLength(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSvgNumberList(value: string): number[] {
  const matches = value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
  return matches?.map(Number) ?? [];
}

function parseSvgOffset(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return value.trim().endsWith('%') ? parsed / 100 : parsed;
}

function parseSvgSpreadMethod(value: string | null): SpreadMethod | null {
  return value === 'reflect' || value === 'repeat' || value === 'pad' ? value : null;
}

function parseSvgTransform(value: string | null): Matrix | null {
  if (value === null || value.trim() === '') return null;
  let result = createMatrix();
  const expression = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value)) !== null) {
    matched = true;
    const values = parseSvgNumberList(match[2]);
    let operation = createMatrix();
    if (match[1] === 'matrix' && values.length >= 6) {
      operation = createMatrix(values[0], values[1], values[2], values[3], values[4], values[5]);
    } else if (match[1] === 'translate') {
      operation.tx = values[0] ?? 0;
      operation.ty = values[1] ?? 0;
    } else if (match[1] === 'scale') {
      operation.a = values[0] ?? 1;
      operation.d = values[1] ?? values[0] ?? 1;
    } else if (match[1] === 'rotate') {
      const radians = ((values[0] ?? 0) * Math.PI) / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const rotation = createMatrix(cosine, sine, -sine, cosine);
      if (values.length >= 3) {
        operation = multiplySvgMatrices(
          createMatrix(1, 0, 0, 1, values[1], values[2]),
          multiplySvgMatrices(rotation, createMatrix(1, 0, 0, 1, -values[1], -values[2])),
        );
      } else {
        operation = rotation;
      }
    } else if (match[1] === 'skewX') {
      operation.c = Math.tan(((values[0] ?? 0) * Math.PI) / 180);
    } else if (match[1] === 'skewY') {
      operation.b = Math.tan(((values[0] ?? 0) * Math.PI) / 180);
    } else {
      continue;
    }
    result = multiplySvgMatrices(result, operation);
  }
  return matched ? result : null;
}

function parseUrlReference(value: string | null): string | null {
  if (value === null) return null;
  const match = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(value.trim());
  return match?.[1] ?? null;
}

function reportRemainingUnsupportedSvgElements(
  element: Readonly<XmlElement>,
  context: SvgImportContext,
  insideDefinitions = false,
): void {
  const name = localName(element.name);
  const definitions = insideDefinitions || name === 'defs';
  if (!definitions && isUnsupportedSvgElementName(name)) {
    reportUnsupportedSvgElement(element, context, 'reportRemainingUnsupportedSvgElements');
  }
  for (const child of element.children) reportRemainingUnsupportedSvgElements(child, context, definitions);
}

function reportUnsupportedSvgElement(element: Readonly<XmlElement>, context: SvgImportContext, origin: string): void {
  if (context.reportedUnsupportedElements.has(element)) return;
  context.reportedUnsupportedElements.add(element);
  const name = localName(element.name);
  reportImportDiagnostic(context.diagnostics, ImportDiagnosticSeverity.Skip, `svg.unsupported-${name}`, origin, {
    element: name,
  });
}

function resolveSvgColor(value: string, currentColor: string): SvgColor | null {
  return parseSvgColor(value.trim().toLowerCase() === 'currentcolor' ? currentColor : value);
}

function resolveSvgGradient(value: string, context: Readonly<SvgImportContext>): SvgGradient | null {
  const id = parseUrlReference(value);
  return id === null ? null : (context.gradientsById.get(id) ?? null);
}

function resolveSvgStyle(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: Readonly<SvgImportContext>,
): SvgStyle {
  const declarations: Record<string, string> = {};
  for (const name of svgPresentationAttributes) {
    const value = attribute(element, name);
    if (value !== null) declarations[name] = value;
  }
  const matchingRules = context.cssRules
    .filter((rule) => matchesCssSelector(element, rule.selector))
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  for (const rule of matchingRules) Object.assign(declarations, rule.declarations);
  Object.assign(declarations, parseStyleDeclarations(attribute(element, 'style') ?? ''));

  // `inherit` is the CSS-wide keyword for "the parent's computed value", legal on every property
  // here. For an inherited property that is exactly what an absent declaration already resolves to,
  // so the declaration is dropped; the three non-inherited properties below reset to an initial
  // value instead, and so name the parent explicitly. Left in the map, the literal string reaches
  // the paint parser as if it were a color, yields no paint, and the geometry silently disappears.
  const inheritedProperties = new Set<string>();
  for (const name of Object.keys(declarations)) {
    if (declarations[name].trim() !== 'inherit') continue;
    inheritedProperties.add(name);
    delete declarations[name];
  }

  const style: SvgStyle = { ...parentStyle };
  style.clipRule = resolveSvgWinding(declarations['clip-rule'], style.clipRule);
  style.color = declarations.color ?? style.color;
  // `display` is not inherited. An ancestor with display:none still suppresses its subtree via
  // the display-object hierarchy (and the clip collector's early return).
  style.display = inheritedProperties.has('display') ? parentStyle.display : (declarations.display ?? 'inline');
  style.fill = declarations.fill ?? style.fill;
  style.fillOpacity = clamp(parseCssNumber(declarations['fill-opacity'], style.fillOpacity), 0, 1);
  style.fillRule = resolveSvgWinding(declarations['fill-rule'], style.fillRule);
  style.filter = inheritedProperties.has('filter') ? parentStyle.filter : (declarations.filter ?? 'none');
  style.fontFamily = declarations['font-family'] ?? style.fontFamily;
  style.fontSize = parseSvgLength(declarations['font-size'] ?? null, style.fontSize);
  style.fontStyle = declarations['font-style'] ?? style.fontStyle;
  style.fontWeight = declarations['font-weight'] ?? style.fontWeight;
  style.opacity = inheritedProperties.has('opacity')
    ? parentStyle.opacity
    : clamp(parseCssNumber(declarations.opacity, 1), 0, 1);
  style.stroke = declarations.stroke ?? style.stroke;
  style.strokeDasharray = declarations['stroke-dasharray'] ?? style.strokeDasharray;
  style.strokeDashoffset = parseSvgLength(declarations['stroke-dashoffset'] ?? null, style.strokeDashoffset);
  style.strokeLinecap = declarations['stroke-linecap'] ?? style.strokeLinecap;
  style.strokeLinejoin = declarations['stroke-linejoin'] ?? style.strokeLinejoin;
  style.strokeMiterlimit = parseCssNumber(declarations['stroke-miterlimit'], style.strokeMiterlimit);
  style.strokeOpacity = clamp(parseCssNumber(declarations['stroke-opacity'], style.strokeOpacity), 0, 1);
  style.strokeWidth = Math.max(0, parseSvgLength(declarations['stroke-width'] ?? null, style.strokeWidth));
  style.textAnchor = declarations['text-anchor'] ?? style.textAnchor;
  style.visibility = declarations.visibility ?? style.visibility;
  return style;
}

function resolveSvgDefinitionStyle(element: Readonly<XmlElement>, context: SvgImportContext): SvgStyle {
  const cached = context.resolvedDefinitionStyles.get(element);
  if (cached !== undefined) return cached;
  const parent = context.parentByElement.get(element) ?? null;
  const parentStyle = parent === null ? defaultSvgStyle : resolveSvgDefinitionStyle(parent, context);
  const style = resolveSvgStyle(element, parentStyle, context);
  context.resolvedDefinitionStyles.set(element, style);
  return style;
}

function firstNumber(value: string | null, fallback: number): number {
  return parseSvgNumberList(value ?? '')[0] ?? fallback;
}

function hasFlattenedSvgTextPosition(
  tspans: ReadonlyArray<Readonly<XmlElement>>,
  firstTspan: Readonly<XmlElement> | undefined,
): boolean {
  return tspans.some((tspan) =>
    ['x', 'y', 'dx', 'dy', 'rotate', 'transform'].some(
      (name) => attribute(tspan, name) !== null && (tspan !== firstTspan || name === 'rotate' || name === 'transform'),
    ),
  );
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

function resolveSvgWinding(value: string | undefined, fallback: PathWinding): PathWinding {
  if (value === 'evenodd') return 'evenOdd';
  if (value === 'nonzero') return 'nonZero';
  return fallback;
}

function usesSvgObjectBoundingBoxUnits(element: Readonly<XmlElement>): boolean {
  return (
    (localName(element.name) === 'mask'
      ? attribute(element, 'maskContentUnits')
      : attribute(element, 'clipPathUnits')) === 'objectBoundingBox'
  );
}

function visitXmlElements(element: Readonly<XmlElement>, visitor: (element: Readonly<XmlElement>) => void): void {
  visitor(element);
  for (const child of element.children) visitXmlElements(child, visitor);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

const svgPresentationAttributes = [
  'clip-rule',
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'visibility',
] as const;

const svgNamedColors: Readonly<Record<string, number>> = {
  aqua: 0x00ffff,
  black: 0x000000,
  blue: 0x0000ff,
  cyan: 0x00ffff,
  fuchsia: 0xff00ff,
  gray: 0x808080,
  green: 0x008000,
  grey: 0x808080,
  lime: 0x00ff00,
  magenta: 0xff00ff,
  maroon: 0x800000,
  navy: 0x000080,
  olive: 0x808000,
  orange: 0xffa500,
  purple: 0x800080,
  red: 0xff0000,
  silver: 0xc0c0c0,
  teal: 0x008080,
  white: 0xffffff,
  yellow: 0xffff00,
};
