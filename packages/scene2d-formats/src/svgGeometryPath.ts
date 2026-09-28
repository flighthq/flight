import { parseSvgPathData } from '@flighthq/path-formats/contract';
import {
  appendPathCircle,
  appendPathEllipse,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathPolygon,
  appendPathPolyline,
  appendPathRectangle,
  appendPathRoundedRectangle,
  createPath,
} from '@flighthq/path/contract';
import type { Path, PathWinding, XmlElement } from '@flighthq/types/contract';

import { svgAttribute, svgLocalName, svgNumberAttribute, parseSvgNumberList } from './svgXml.ts';

/**
 * Reading one SVG geometry element — rect, circle, ellipse, line, polygon, polyline, path — into a Path.
 *
 * ★ TWO OWNERS, WHICH IS THE ONE SVG SEAM THAT IS NOT A LAYERING MISTAKE. The geometry family reads these elements to
 * draw them, and the CLIP machinery reads the very same elements inside a `<clipPath>` to build a region from them.
 * Clipping is not a family a caller can decline — `applySvgElementClip` runs for every element — so this reader is
 * live in every build that can clip, and that is honest rather than accidental. Making clip geometry its own
 * selectable family is the only thing that would change it, and that is a design decision, not a refactor.
 *
 * `null` means "not a geometry element", which is how the dispatch tells a `<rect>` from a `<g>`.
 */
export function createSvgGeometryPath(element: Readonly<XmlElement>, winding: PathWinding): Path | null {
  const name = svgLocalName(element.name);
  if (name === 'path') {
    const path = parseSvgPathData(svgAttribute(element, 'd') ?? '');
    if (path !== null) path.winding = winding;
    return path;
  }

  const path = createPath(winding);
  if (name === 'rect') {
    const x = svgNumberAttribute(element, 'x', 0);
    const y = svgNumberAttribute(element, 'y', 0);
    const width = svgNumberAttribute(element, 'width', 0);
    const height = svgNumberAttribute(element, 'height', 0);
    const rx = Math.max(0, svgNumberAttribute(element, 'rx', 0));
    const ry = Math.max(0, svgNumberAttribute(element, 'ry', rx));
    if (width <= 0 || height <= 0) return path;
    if (rx > 0 || ry > 0)
      appendPathRoundedRectangle(path, x, y, width, height, Math.min(Math.max(rx, ry), width / 2, height / 2));
    else appendPathRectangle(path, x, y, width, height);
    return path;
  }
  if (name === 'circle') {
    appendPathCircle(
      path,
      svgNumberAttribute(element, 'cx', 0),
      svgNumberAttribute(element, 'cy', 0),
      Math.max(0, svgNumberAttribute(element, 'r', 0)),
    );
    return path;
  }
  if (name === 'ellipse') {
    appendPathEllipse(
      path,
      svgNumberAttribute(element, 'cx', 0),
      svgNumberAttribute(element, 'cy', 0),
      Math.max(0, svgNumberAttribute(element, 'rx', 0)),
      Math.max(0, svgNumberAttribute(element, 'ry', 0)),
    );
    return path;
  }
  if (name === 'line') {
    appendPathMoveTo(path, svgNumberAttribute(element, 'x1', 0), svgNumberAttribute(element, 'y1', 0));
    appendPathLineTo(path, svgNumberAttribute(element, 'x2', 0), svgNumberAttribute(element, 'y2', 0));
    return path;
  }
  if (name === 'polygon' || name === 'polyline') {
    const points = parseSvgNumberList(svgAttribute(element, 'points') ?? '');
    if (name === 'polygon') appendPathPolygon(path, points);
    else appendPathPolyline(path, points);
    return path;
  }
  return null;
}
