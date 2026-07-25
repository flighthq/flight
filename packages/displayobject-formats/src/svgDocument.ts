import { createClipRegionFromPath } from '@flighthq/clip';
import { packColor } from '@flighthq/color';
import { createDisplayContainer } from '@flighthq/displayobject';
import {
  createGradientTransformMatrix,
  createMatrix,
  createRectangle,
  createTransform2D,
  decomposeMatrixToTransform2D,
  multiplyMatrix,
} from '@flighthq/geometry';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics';
import { addNodeChild } from '@flighthq/node';
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
} from '@flighthq/path';
import { parseSvgPathData } from '@flighthq/path-formats';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapePath,
  createShape,
} from '@flighthq/shape';
import { createTextLabel } from '@flighthq/text';
import type {
  DisplayContainer,
  DisplayObject,
  ImportDiagnostic,
  Matrix,
  Path,
  PathWinding,
  Shape,
  SpreadMethod,
  TextFormat,
  Transform2D,
  XmlElement,
} from '@flighthq/types';
import { ImportDiagnosticSeverity } from '@flighthq/types';
import { parseXmlDocument } from '@flighthq/xml';

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
export function createDisplayObjectFromSvgDocument(source: string, diagnostics?: ImportDiagnostic[]): DisplayContainer {
  const out = createDisplayContainer();
  const document = parseXmlDocument(source);
  if (document === null || localName(document.name) !== 'svg') {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'svg.invalid-document',
      'createDisplayObjectFromSvgDocument',
    );
    return out;
  }

  const context: SvgImportContext = {
    cssRules: collectCssRules(document),
    diagnostics,
    elementsById: new Map(),
    gradientsById: new Map(),
    resolvingUses: new Set(),
  };
  indexSvgDefinitions(document, context);

  out.name = attribute(document, 'id');
  applySvgElementAppearance(out, document, defaultSvgStyle, context);
  applySvgTransform(out, createSvgViewportMatrix(document));
  appendSvgChildren(out, document, defaultSvgStyle, context);
  return out;
}

interface SvgColor {
  alpha: number;
  rgb: number;
}

interface SvgCssRule {
  declarations: Record<string, string>;
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
  resolvingUses: Set<string>;
}

interface SvgStyle {
  color: string;
  display: string;
  fill: string;
  fillOpacity: number;
  fillRule: PathWinding;
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

const defaultSvgStyle: SvgStyle = {
  color: '#000000',
  display: 'inline',
  fill: '#000000',
  fillOpacity: 1,
  fillRule: 'nonZero',
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
  parent: DisplayContainer,
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
  target: DisplayObject,
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): SvgStyle {
  const style = resolveSvgStyle(element, parentStyle, context);
  target.alpha = style.opacity;
  target.visible = style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  target.name = attribute(element, 'id');

  const transform = parseSvgTransform(attribute(element, 'transform'));
  applySvgTransform(target, transform);

  const clipReference = parseUrlReference(attribute(element, 'clip-path'));
  const maskReference = parseUrlReference(attribute(element, 'mask'));
  const clipId = clipReference ?? maskReference;
  if (clipId !== null) {
    const clipElement = context.elementsById.get(clipId);
    const clipPath = clipElement === undefined ? null : createSvgClipPath(clipElement);
    if (clipPath !== null) {
      target.clip = createClipRegionFromPath(clipPath);
      if (maskReference !== null) {
        reportImportDiagnostic(
          context.diagnostics,
          ImportDiagnosticSeverity.Recover,
          'svg.mask-as-hard-clip',
          'applySvgElementAppearance',
          { id: maskReference },
        );
      }
    } else {
      reportImportDiagnostic(
        context.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'svg.unresolved-clip-reference',
        'applySvgElementAppearance',
        { id: clipId },
      );
    }
  }
  return style;
}

function applySvgTransform(target: DisplayObject, matrix: Readonly<Matrix> | null): void {
  if (matrix === null) return;
  const transform = createTransform2D();
  decomposeMatrixToTransform2D(transform, matrix);
  assignSvgTransform(target, transform);
}

function assignSvgTransform(target: DisplayObject, transform: Readonly<Transform2D>): void {
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
        rules.push({ declarations, selector, specificity: getCssSelectorSpecificity(selector) });
      }
    }
  });
  return rules;
}

function createSvgClipPath(element: Readonly<XmlElement>): Path | null {
  const out = createPath('nonZero');
  let appended = false;
  for (const child of element.children) {
    const childPath = createSvgGeometryPath(child, 'nonZero');
    if (childPath === null) continue;
    const transform = parseSvgTransform(attribute(child, 'transform'));
    const resolved = transform === null ? childPath : createPath(childPath.winding);
    if (transform !== null) transformPath(childPath, transform, resolved);
    appendPathData(out, resolved);
    appended = true;
  }
  if (!appended) return null;
  const transform = parseSvgTransform(attribute(element, 'transform'));
  if (transform === null) return out;
  const transformed = createPath(out.winding);
  transformPath(out, transform, transformed);
  return transformed;
}

function createSvgElementNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): DisplayObject | null {
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
    const container = createDisplayContainer();
    const style = applySvgElementAppearance(container, element, parentStyle, context);
    if (name === 'svg') {
      const viewport = createSvgViewportMatrix(element);
      if (viewport !== null) {
        const own = parseSvgTransform(attribute(element, 'transform'));
        applySvgTransform(container, own === null ? viewport : multiplySvgMatrices(own, viewport));
      }
    }
    appendSvgChildren(container, element, style, context);
    return container;
  }

  if (name === 'use') return createSvgUseNode(element, parentStyle, context);
  if (name === 'text') return createSvgTextNode(element, parentStyle, context);

  const style = resolveSvgStyle(element, parentStyle, context);
  const path = createSvgGeometryPath(element, style.fillRule);
  if (path !== null) {
    const shape = createShape();
    applySvgElementAppearance(shape, element, parentStyle, context);
    appendSvgShapePaint(shape, path, style, element, context);
    return shape;
  }

  const unsupportedKind =
    name === 'image' ||
    name === 'filter' ||
    name === 'foreignObject' ||
    name === 'script' ||
    name === 'animate' ||
    name === 'animateTransform' ||
    name === 'set' ||
    name === 'pattern';
  reportImportDiagnostic(
    context.diagnostics,
    ImportDiagnosticSeverity.Skip,
    unsupportedKind ? `svg.unsupported-${name}` : 'svg.unknown-element',
    'createSvgElementNode',
    { element: name },
  );
  return null;
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
): DisplayObject {
  const style = resolveSvgStyle(element, parentStyle, context);
  const text = collectSvgText(element);
  const color = resolveSvgColor(style.fill, style.color) ?? { alpha: 1, rgb: 0 };
  const format: TextFormat = {
    align: style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left',
    bold: style.fontWeight === 'bold' || Number(style.fontWeight) >= 600,
    color: packColor(
      ((color.rgb >>> 16) & 0xff) / 255,
      ((color.rgb >>> 8) & 0xff) / 255,
      (color.rgb & 0xff) / 255,
      color.alpha * style.fillOpacity,
    ),
    font: style.fontFamily.replace(/^['"]|['"]$/g, ''),
    italic: style.fontStyle === 'italic' || style.fontStyle === 'oblique',
    size: style.fontSize,
  };
  const label = createTextLabel({
    alpha: style.opacity,
    data: { autoSize: 'left', height: style.fontSize * 1.25, text, textFormat: format, width: 10000 },
    name: attribute(element, 'id'),
    visible: style.display !== 'none' && style.visibility === 'visible',
    x: firstNumber(attribute(element, 'x'), 0) + firstNumber(attribute(element, 'dx'), 0),
    y: firstNumber(attribute(element, 'y'), 0) + firstNumber(attribute(element, 'dy'), 0) - style.fontSize,
  });
  const transform = parseSvgTransform(attribute(element, 'transform'));
  applySvgTransform(label, transform);
  return label;
}

function createSvgUseNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): DisplayObject | null {
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
  const container = createDisplayContainer();
  const style = applySvgElementAppearance(container, element, parentStyle, context);
  container.x += numberAttribute(element, 'x', 0);
  container.y += numberAttribute(element, 'y', 0);
  const referencedNode =
    localName(referenced.name) === 'symbol'
      ? createSvgSymbolNode(referenced, style, context)
      : createSvgElementNode(referenced, style, context);
  if (referencedNode !== null) addNodeChild(container, referencedNode);
  context.resolvingUses.delete(id);
  return container;
}

function createSvgSymbolNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): DisplayContainer {
  const container = createDisplayContainer({ name: attribute(element, 'id') });
  const style = resolveSvgStyle(element, parentStyle, context);
  appendSvgChildren(container, element, style, context);
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
      createSvgGradientMatrix(fillGradient, path),
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
      createSvgGradientMatrix(strokeGradient, path),
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

function collectSvgText(element: Readonly<XmlElement>): string {
  let text = element.text;
  for (const child of element.children) text += collectSvgText(child);
  return text;
}

function createSvgGradientMatrix(gradient: Readonly<SvgGradient>, path: Readonly<Path>): Matrix {
  const bounds = createRectangle();
  getPathBounds(path, bounds);
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

function createSvgViewportMatrix(element: Readonly<XmlElement>): Matrix | null {
  const x = numberAttribute(element, 'x', 0);
  const y = numberAttribute(element, 'y', 0);
  const viewBox = parseSvgNumberList(attribute(element, 'viewBox') ?? '');
  if (viewBox.length < 4) return x === 0 && y === 0 ? null : createMatrix(1, 0, 0, 1, x, y);
  const width = parseSvgLength(attribute(element, 'width'), viewBox[2]);
  const height = parseSvgLength(attribute(element, 'height'), viewBox[3]);
  const sx = viewBox[2] === 0 ? 1 : width / viewBox[2];
  const sy = viewBox[3] === 0 ? 1 : height / viewBox[3];
  return createMatrix(sx, 0, 0, sy, x - viewBox[0] * sx, y - viewBox[1] * sy);
}

function getCssSelectorSpecificity(selector: string): number {
  if (selector.startsWith('#')) return 100;
  if (selector.startsWith('.')) return 10;
  return 1;
}

function indexSvgDefinitions(root: Readonly<XmlElement>, context: SvgImportContext): void {
  visitXmlElements(root, (element) => {
    const id = attribute(element, 'id');
    if (id !== null) context.elementsById.set(id, element);
  });
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
  if (functionMatch !== null && (functionMatch[1] === 'rgb' || functionMatch[1] === 'rgba')) {
    const components = functionMatch[2].split(/[\s,/]+/).filter(Boolean);
    if (components.length >= 3) {
      const component = (index: number): number => {
        const text = components[index];
        return text.endsWith('%') ? (Number.parseFloat(text) * 255) / 100 : Number.parseFloat(text);
      };
      const r = Math.round(clamp(component(0), 0, 255));
      const g = Math.round(clamp(component(1), 0, 255));
      const b = Math.round(clamp(component(2), 0, 255));
      const alpha = components[3] === undefined ? 1 : clamp(Number.parseFloat(components[3]), 0, 1);
      if (Number.isFinite(r + g + b + alpha)) return { alpha, rgb: (r << 16) | (g << 8) | b };
    }
  }
  const named = svgNamedColors[normalized];
  return named === undefined ? null : { alpha: 1, rgb: named };
}

function parseSvgGradient(element: Readonly<XmlElement>, context: SvgImportContext): SvgGradient | null {
  const kind = localName(element.name) === 'linearGradient' ? 'linear' : 'radial';
  const href = attribute(element, 'href');
  const inherited = href?.startsWith('#') === true ? context.gradientsById.get(href.slice(1)) : undefined;
  const stops: SvgGradientStop[] = [];
  for (const child of element.children) {
    if (localName(child.name) !== 'stop') continue;
    const declarations = parseStyleDeclarations(attribute(child, 'style') ?? '');
    const color = parseSvgColor(attribute(child, 'stop-color') ?? declarations['stop-color'] ?? '#000000');
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

function resolveSvgColor(value: string, currentColor: string): SvgColor | null {
  return parseSvgColor(value === 'currentColor' ? currentColor : value);
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
  const matchingRules = context.cssRules
    .filter((rule) => matchesCssSelector(element, rule.selector))
    .sort((a, b) => a.specificity - b.specificity);
  for (const rule of matchingRules) Object.assign(declarations, rule.declarations);
  for (const name of svgPresentationAttributes) {
    const value = attribute(element, name);
    if (value !== null) declarations[name] = value;
  }
  Object.assign(declarations, parseStyleDeclarations(attribute(element, 'style') ?? ''));

  const style: SvgStyle = { ...parentStyle };
  style.color = declarations.color ?? style.color;
  style.display = declarations.display ?? style.display;
  style.fill = declarations.fill ?? style.fill;
  style.fillOpacity = clamp(parseCssNumber(declarations['fill-opacity'], style.fillOpacity), 0, 1);
  style.fillRule = declarations['fill-rule'] === 'evenodd' ? 'evenOdd' : 'nonZero';
  style.fontFamily = declarations['font-family'] ?? style.fontFamily;
  style.fontSize = parseSvgLength(declarations['font-size'] ?? null, style.fontSize);
  style.fontStyle = declarations['font-style'] ?? style.fontStyle;
  style.fontWeight = declarations['font-weight'] ?? style.fontWeight;
  style.opacity = clamp(parseCssNumber(declarations.opacity, 1), 0, 1);
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

function firstNumber(value: string | null, fallback: number): number {
  return parseSvgNumberList(value ?? '')[0] ?? fallback;
}

function visitXmlElements(element: Readonly<XmlElement>, visitor: (element: Readonly<XmlElement>) => void): void {
  visitor(element);
  for (const child of element.children) visitXmlElements(child, visitor);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

const svgPresentationAttributes = [
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
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
