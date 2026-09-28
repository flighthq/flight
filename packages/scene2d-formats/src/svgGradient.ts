import {
  createGradientTransformMatrix,
  createMatrix,
  createRectangle,
  inverseMatrix,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { clamp } from '@flighthq/math/contract';
import { getPathBounds } from '@flighthq/path/contract';
import type {
  Matrix,
  Path,
  SpreadMethod,
  SvgGradient,
  SvgGradientStop,
  SvgImportContext,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { resolveSvgColor } from './svgColor.ts';
import { parseStyleDeclarations, resolveSvgDefinitionStyle } from './svgStyle.ts';
import { multiplySvgMatrices, parseSvgTransform } from './svgTransform.ts';
import { svgAttribute, svgLocalName, parseSvgCssNumber, parseSvgCoordinate, parseUrlReference } from './svgXml.ts';

export function createSvgGradientMatrix(gradient: Readonly<SvgGradient>, path: Readonly<Path>): Matrix {
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
    // createGradientTransformMatrix takes the gradient box's ORIGIN, not its centre — it ends with
    // `tx + width / 2`, doing the centring itself. Passing the midpoint here made that offset apply twice
    // and shifted every SVG gradient by half its own extent. SWF never hit this because it carries a matrix
    // straight from the file and does not call this helper.
    matrix = createGradientTransformMatrix(
      length,
      length,
      Math.atan2(dy, dx),
      (x1 + x2) / 2 - length / 2,
      (y1 + y2) / 2 - length / 2,
    );
  } else {
    const radiusX = gradient.units === 'objectBoundingBox' ? gradient.radius * bounds.width : gradient.radius;
    const radiusY = gradient.units === 'objectBoundingBox' ? gradient.radius * bounds.height : gradient.radius;
    // Same origin-not-centre rule: the box is 2r across, so its origin is the centre minus one radius.
    const boxWidth = Math.max(radiusX * 2, 1);
    const boxHeight = Math.max(radiusY * 2, 1);
    matrix = createGradientTransformMatrix(
      boxWidth,
      boxHeight,
      0,
      mapX(gradient.cx) - boxWidth / 2,
      mapY(gradient.cy) - boxHeight / 2,
    );
  }
  if (gradient.transform !== null) matrix = multiplySvgMatrices(gradient.transform, matrix);
  return matrix;
}

/**
 * SVG gradients: the stop list, the spread, and the matrix that places a gradient over a shape.
 *
 * ★ TWO UNIT SYSTEMS, AND THE DEFAULT ONE NEEDS THE SHAPE. `gradientUnits="userSpaceOnUse"` places a gradient in the
 * document's coordinates; anything else — including the default — places it in a 0..1 box over the shape being filled,
 * so a gradient cannot be resolved without the path it is painting, and a zero-area box has no gradient at all rather
 * than an infinitely thin one. (`clipPathUnits` is the same idea for clipping and is read by the clip module, which is
 * the only thing that asks.)
 *
 * Only the geometry family paints, so nothing else in the importer reaches this: a text-or-image-only build links no
 * gradient reading at all.
 */
// objectBoundingBox units on geometry with no width or height: the format says the effect is IGNORED, and
// that rule is defined once for every consumer of these units — clipPath, mask, pattern, filter, gradient.
// The clip path already behaves this way; this is what lets the gradient match it instead of scaling by a
// zero and producing a collapsed matrix that still paints.
export function hasZeroAreaSvgGradientBox(gradient: Readonly<SvgGradient>, path: Readonly<Path>): boolean {
  if (gradient.units !== 'objectBoundingBox') return false;
  const bounds = createRectangle();
  getPathBounds(path, bounds);
  return bounds.width === 0 || bounds.height === 0;
}

// A gradientTransform is authored text, so it can be singular — `scale(0)` is the plain case. Validated
// HERE, where the file's value enters and a diagnostics sink exists, rather than at the renderer that
// eventually inverts it: `inverseMatrix` answers a singular matrix with a defined-but-wrong result
// (a/b/c/d zeroed, tx/ty negated) rather than NaN, so an unvalidated one paints wrong pixels with no
// error raised and nothing to grep for. Dropping it to `null` is the same untransformed path a gradient
// with no gradientTransform already takes — an existing, supported state rather than a new one, and
// honest in a way identity would not be, since identity silently resizes and repositions the fill.
//
// Shares the predicate with the consumer by asking `inverseMatrix` rather than testing a determinant
// here, so the two cannot drift apart on what "singular" means.
function resolveSvgGradientTransform(
  element: Readonly<XmlElement>,
  inherited: Readonly<SvgGradient> | null | undefined,
  context: SvgImportContext,
): Matrix | null {
  const transform = parseSvgTransform(svgAttribute(element, 'gradientTransform')) ?? inherited?.transform ?? null;
  if (transform === null) return null;
  if (inverseMatrix(_gradientTransformScratch, transform)) return transform;
  reportImportDiagnostic(
    context.diagnostics,
    ImportDiagnosticSeverity.Recover,
    'svg.gradient-transform-singular',
    'resolveSvgGradientTransform',
    { gradient: svgAttribute(element, 'id') ?? '<unnamed>' },
  );
  return null;
}

const _gradientTransformScratch = createMatrix();

export function parseSvgGradient(element: Readonly<XmlElement>, context: SvgImportContext): SvgGradient | null {
  const kind = svgLocalName(element.name) === 'linearGradient' ? 'linear' : 'radial';
  const href = svgAttribute(element, 'href');
  const inheritedId = href?.startsWith('#') === true ? href.slice(1) : null;
  let inherited = inheritedId === null ? undefined : context.gradientsById.get(inheritedId);
  if (inherited === undefined && inheritedId !== null && !context.resolvingGradients.has(inheritedId)) {
    const inheritedElement = context.elementsById.get(inheritedId);
    if (
      inheritedElement !== undefined &&
      (svgLocalName(inheritedElement.name) === 'linearGradient' ||
        svgLocalName(inheritedElement.name) === 'radialGradient')
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
    if (svgLocalName(child.name) !== 'stop') continue;
    const declarations = parseStyleDeclarations(svgAttribute(child, 'style') ?? '');
    const color = resolveSvgColor(
      svgAttribute(child, 'stop-color') ?? declarations['stop-color'] ?? '#000000',
      resolveSvgDefinitionStyle(child, context).color,
    );
    if (color === null) continue;
    color.alpha *= clamp(
      parseSvgCssNumber(svgAttribute(child, 'stop-opacity') ?? declarations['stop-opacity'], 1),
      0,
      1,
    );
    stops.push({
      color,
      offset: clamp(parseSvgOffset(svgAttribute(child, 'offset')), 0, 1),
    });
  }
  const resolvedStops =
    stops.length === 0
      ? (inherited?.stops.map((stop) => ({ color: { ...stop.color }, offset: stop.offset })) ?? [])
      : stops;
  if (resolvedStops.length === 0) return null;
  resolvedStops.sort((a, b) => a.offset - b.offset);
  return {
    cx: parseSvgCoordinate(svgAttribute(element, 'cx'), inherited?.cx ?? 0.5),
    cy: parseSvgCoordinate(svgAttribute(element, 'cy'), inherited?.cy ?? 0.5),
    fx: parseSvgCoordinate(svgAttribute(element, 'fx'), inherited?.fx ?? 0.5),
    fy: parseSvgCoordinate(svgAttribute(element, 'fy'), inherited?.fy ?? 0.5),
    kind,
    radius: parseSvgCoordinate(svgAttribute(element, 'r'), inherited?.radius ?? 0.5),
    spreadMethod: parseSvgSpreadMethod(svgAttribute(element, 'spreadMethod')) ?? inherited?.spreadMethod ?? 'pad',
    stops: resolvedStops,
    transform: resolveSvgGradientTransform(element, inherited, context),
    units:
      svgAttribute(element, 'gradientUnits') === 'userSpaceOnUse'
        ? 'userSpaceOnUse'
        : (inherited?.units ?? 'objectBoundingBox'),
    x1: parseSvgCoordinate(svgAttribute(element, 'x1'), inherited?.x1 ?? 0),
    x2: parseSvgCoordinate(svgAttribute(element, 'x2'), inherited?.x2 ?? 1),
    y1: parseSvgCoordinate(svgAttribute(element, 'y1'), inherited?.y1 ?? 0),
    y2: parseSvgCoordinate(svgAttribute(element, 'y2'), inherited?.y2 ?? 0),
  };
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

export function resolveSvgGradient(value: string, context: Readonly<SvgImportContext>): SvgGradient | null {
  const id = parseUrlReference(value);
  return id === null ? null : (context.gradientsById.get(id) ?? null);
}
