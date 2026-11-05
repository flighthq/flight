// Generated from crates/flight-scene2d-formats/src/svg_geometry_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

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
import type { Path, PathWinding } from '@flighthq/path/contract';
import type { XmlElement } from '@flighthq/xml/contract';

import { parseSvgNumberList, svgAttribute, svgLocalName, svgNumberAttribute } from './svgXml.ts';

export function createSvgGeometryPath(element: Readonly<XmlElement>, winding: PathWinding): Path | null {
  const name = svgLocalName(element.name);
  if (name === 'path') {
    let path = parseSvgPathData(svgAttribute(element, 'd') ?? '');
    if (path === undefined) {
      return null;
    }
    path.winding = winding;
    return path;
  }
  let path = createPath('nonZero');
  path.winding = winding;
  if (name === 'rect') {
    const x = svgNumberAttribute(element, 'x', 0);
    const y = svgNumberAttribute(element, 'y', 0);
    const width = svgNumberAttribute(element, 'width', 0);
    const height = svgNumberAttribute(element, 'height', 0);
    const radiusX = Math.max(svgNumberAttribute(element, 'rx', 0), 0);
    const radiusY = Math.max(svgNumberAttribute(element, 'ry', radiusX), 0);
    if (width <= 0 || height <= 0) {
      return path;
    }
    if (radiusX > 0 || radiusY > 0) {
      appendPathRoundedRectangle(
        path,
        x,
        y,
        width,
        height,
        Math.min(Math.min(Math.max(radiusX, radiusY), width / 2), height / 2),
      );
    } else {
      appendPathRectangle(path, x, y, width, height);
    }
    return path;
  }
  if (name === 'circle') {
    appendPathCircle(
      path,
      svgNumberAttribute(element, 'cx', 0),
      svgNumberAttribute(element, 'cy', 0),
      Math.max(svgNumberAttribute(element, 'r', 0), 0),
    );
    return path;
  }
  if (name === 'ellipse') {
    appendPathEllipse(
      path,
      svgNumberAttribute(element, 'cx', 0),
      svgNumberAttribute(element, 'cy', 0),
      Math.max(svgNumberAttribute(element, 'rx', 0), 0),
      Math.max(svgNumberAttribute(element, 'ry', 0), 0),
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
    if (name === 'polygon') {
      appendPathPolygon(path, points);
    } else {
      appendPathPolyline(path, points);
    }
    return path;
  }
  return null;
}
