import {
  createClipRegionFromPath,
  intersectClipRegions,
  transformClipRegion,
  unionClipRegions,
} from '@flighthq/clip/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createPath, transformPath } from '@flighthq/path/contract';
import type {
  ClipRegion,
  SvgClipContext,
  Matrix,
  Node2D,
  Path,
  PathWinding,
  Rectangle,
  SvgImportContext,
  SvgStyle,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createSvgNode2DBounds, hasUnmeasurableSvgText } from './svgBounds.ts';
import { createSvgGeometryPath } from './svgGeometryPath.ts';
import { resolveSvgDefinitionStyle, resolveSvgStyle } from './svgStyle.ts';
import { createSvgViewportMatrix, multiplySvgMatrices, parseSvgTransform } from './svgTransform.ts';
import {
  svgAttribute,
  svgLocalName,
  svgNumberAttribute,
  svgOptionalNumberAttribute,
  parseUrlReference,
} from './svgXml.ts';

/**
 * Lowering `clip-path` onto Flight's ClipRegion.
 *
 * ★ NOT A FAMILY A CALLER CAN DECLINE, WHICH IS WHY IT IS NOT ONE. Every element may carry `clip-path`, so the walk
 * asks every element and whatever this module reaches is live in every build — including `createSvgGeometryPath`, since
 * a `<clipPath>` is defined by the same rect/circle/path elements the geometry family draws, and the `use` resolution
 * here, which is a second reading of the one the use family owns.
 *
 * The recursion guards are the format's: a clip may reference another clip and a `use` inside one may reference an
 * element that references back, and both cycles are rejected by id rather than by depth.
 */
interface SvgClipGeometry {
  path: Path | null;
  region: ClipRegion | null;
  winding: PathWinding;
}

/**
 * The `clip-path` (and `mask`) handler: the whole of Flight's clipping, reachable only by registering it.
 *
 * ★ IT MEASURES ITS OWN TARGET. The bounding box `clipPathUnits="objectBoundingBox"` is defined against used to be
 * computed by every caller and passed in, which put `svgBounds` — and `@flighthq/shape`'s `getShapeBounds` behind it —
 * into a build that registered no clipping at all. The geometry family records its fill-only box in the context as it
 * draws, so the box is available here without the walk having to compute one for a clip that may never be asked for.
 */
export function svgPathClipHandler(context: SvgClipContext): void {
  const { element, target } = context;
  const importContext = context.import;
  applySvgElementClip(target, element, importContext, createSvgNode2DBounds(target, importContext));
}

function applySvgElementClip(
  target: Node2D,
  element: Readonly<XmlElement>,
  context: SvgImportContext,
  targetBounds: Readonly<Rectangle> | null,
): void {
  const clipReference = parseUrlReference(svgAttribute(element, 'clip-path'));
  const maskReference = parseUrlReference(svgAttribute(element, 'mask'));
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
    // TWO SITUATIONS REACH HERE AND ONLY ONE IS A DEFECT.
    //
    // Zero-area target: objectBoundingBox units on geometry with no width or height means the effect is
    // IGNORED. Dropping the clip is the correct rendering, so this path is conformant and says nothing —
    // a failure-flavoured diagnostic on correct behaviour trains callers to ignore the channel.
    //
    // Unmeasurable target: the format defines a box here and we cannot compute one, because this importer
    // performs no text layout. That is our capability gap, and it is the caller's only warning that the
    // rendering they get is not the rendering the file describes.
    if (hasUnmeasurableSvgText(target)) {
      reportImportDiagnostic(
        context.diagnostics,
        ImportDiagnosticSeverity.Skip,
        'svg.object-bounding-box-clip-unmeasurable-bounds',
        'applySvgElementClip',
        { id: clipId },
      );
    }
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
        { id: svgAttribute(element, 'id') ?? '' },
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
  let transform = parseSvgTransform(svgAttribute(element, 'transform'));
  const unitsAttribute =
    svgLocalName(element.name) === 'mask'
      ? svgAttribute(element, 'maskContentUnits')
      : svgAttribute(element, 'clipPathUnits');
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
  const name = svgLocalName(element.name);
  let geometryTransform: Matrix | null = null;
  if (name === 'use') {
    geometryTransform = createMatrix(
      1,
      0,
      0,
      1,
      svgNumberAttribute(element, 'x', 0),
      svgNumberAttribute(element, 'y', 0),
    );
  } else if (name === 'svg') {
    geometryTransform = createSvgViewportMatrix(element);
  } else if (name === 'symbol' && viewportElement !== undefined) {
    geometryTransform = createSvgViewportMatrix(element, {
      height: svgOptionalNumberAttribute(viewportElement, 'height') ?? undefined,
      width: svgOptionalNumberAttribute(viewportElement, 'width') ?? undefined,
      x: 0,
      y: 0,
    });
  }
  const authorTransform = parseSvgTransform(svgAttribute(element, 'transform'));
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
    if (parseUrlReference(svgAttribute(element, 'clip-path')) === null) {
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
    if (parseUrlReference(svgAttribute(element, 'clip-path')) !== null) {
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
  const id = parseUrlReference(svgAttribute(element, 'clip-path'));
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
  const href = svgAttribute(element, 'href');
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

function appendPathData(out: Path, source: Readonly<Path>): void {
  out.commands.push(...source.commands);
  out.data.push(...source.data);
}

export function usesSvgObjectBoundingBoxUnits(element: Readonly<XmlElement>): boolean {
  return (
    (svgLocalName(element.name) === 'mask'
      ? svgAttribute(element, 'maskContentUnits')
      : svgAttribute(element, 'clipPathUnits')) === 'objectBoundingBox'
  );
}
