import { createRectangle } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createPath, dashPath, getPathBounds } from '@flighthq/path/contract';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapePath,
  createShape,
} from '@flighthq/shape/contract';
import type {
  Node2D,
  Path,
  Shape,
  SvgElementContext,
  SvgImportContext,
  SvgStyle,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { applySvgElementClip } from './svgClip.ts';
import { resolveSvgColor } from './svgColor.ts';
import { applySvgElementAppearance } from './svgDocument.ts';
import { createSvgGeometryPath } from './svgGeometryPath.ts';
import { createSvgGradientMatrix, hasZeroAreaSvgGradientBox, resolveSvgGradient } from './svgGradient.ts';
import { resolveSvgStyle } from './svgStyle.ts';
import { svgLocalName, parseSvgNumberList, parseUrlReference } from './svgXml.ts';

/**
 * The geometry elements — rect, circle, ellipse, line, polygon, polyline, path — and how they are painted.
 *
 * ★ THE ONLY FAMILY THAT PAINTS, so `@flighthq/shape`'s fill, stroke and gradient builders are named here and nowhere
 * else, and the gradient reading is reachable only through this module. A text-or-image-only build links none of it.
 *
 * The fill-only bounding box is recorded at creation time on purpose: SVG defines `objectBoundingBox` units over the
 * geometry's extent, which EXCLUDES the stroke, and the node's own bounds deliberately include it.
 */
export function svgGeometryElementHandler(context: SvgElementContext): Node2D | null {
  const { element, parentStyle } = context;
  const importContext = context.import;
  const style = resolveSvgStyle(element, parentStyle, importContext);
  const path = createSvgGeometryPath(element, style.fillRule);
  if (path === null) return null;
  const shape = createShape();
  applySvgElementAppearance(shape, element, parentStyle, importContext);
  appendSvgShapePaint(shape, path, style, element, importContext);
  const bounds = createRectangle();
  getPathBounds(path, bounds);
  importContext.objectBoundingBoxes.set(shape, bounds);
  applySvgElementClip(shape, element, importContext, bounds);
  return shape;
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
  // A resolved gradient whose objectBoundingBox is zero-area is IGNORED, not unresolved: the reference was
  // found, the format says the effect does not apply, and nothing is painted. Kept distinct from the
  // `fillGradient === null` path below on purpose — that one means the url() named nothing, which is a real
  // defect in the file and is reported. Collapsing the two would file conformant behaviour as a Drop.
  if (fillGradient !== null && hasZeroAreaSvgGradientBox(fillGradient, path)) return;
  if (fillGradient !== null) {
    appendShapeBeginGradientFill(
      shape,
      fillGradient.kind,
      fillGradient.stops.map((stop) => ((stop.color.rgb << 8) | 0xff) >>> 0),
      fillGradient.stops.map((stop) => stop.color.alpha * style.fillOpacity),
      fillGradient.stops.map((stop) => Math.round(stop.offset * 255)),
      createSvgGradientMatrix(fillGradient, path),
      fillGradient.spreadMethod,
    );
  } else if (fillColor !== null) {
    appendShapeBeginFill(shape, ((fillColor.rgb << 8) | 0xff) >>> 0, fillColor.alpha * style.fillOpacity);
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
      { element: svgLocalName(element.name) },
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
        { element: svgLocalName(element.name) },
      );
    }
    return;
  }

  appendShapeLineStyle(
    shape,
    style.strokeWidth,
    strokeColor !== null ? ((strokeColor.rgb << 8) | 0xff) >>> 0 : 0x000000ff,
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
      strokeGradient.stops.map((stop) => ((stop.color.rgb << 8) | 0xff) >>> 0),
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

function mapSvgLineCap(value: string): 'none' | 'round' | 'square' {
  return value === 'round' ? 'round' : value === 'square' ? 'square' : 'none';
}

function mapSvgLineJoin(value: string): 'bevel' | 'miter' | 'round' {
  return value === 'round' ? 'round' : value === 'bevel' ? 'bevel' : 'miter';
}
