import { appendPathCubicCurveTo, appendPathMoveTo, appendPathPolygon, createPath } from '@flighthq/path/contract';
import type { LottiePolystarShapeItem, LottieShapeItemContext } from '@flighthq/types/contract';
import type { Path } from '@flighthq/types/contract';

import { bindMutableLottieNumericProperty, initialLottieValue, lottieNumericValue } from './lottieDocument.ts';
import { lottieDegreesToRadians } from './lottieDocument.ts';
import { applyLottieShapeDirection } from './lottieShapeGeometry.ts';
// Roundness bows each edge outward while the vertices stay on their radius, so the tangent handle is
// perpendicular to the radius. Its length comes from the relation the format itself fixes: a polygon
// at 100% roundness is the circumscribed circle, and the cubic that matches a circular arc spanning
// angle t has handles of r * (4/3) * tan(t / 4). Roundness scales that length linearly.
function createLottiePolystarPath(
  kind: 1 | 2,
  center: readonly number[],
  pointCount: number,
  outer: number,
  inner: number,
  rotationDegrees: number,
  outerRoundness = 0,
  innerRoundness = 0,
): Path {
  const path = createPath();
  const points = Math.max(2, Math.round(pointCount));
  const rotation = lottieDegreesToRadians(rotationDegrees - 90);
  const count = kind === 1 ? points * 2 : points;
  const step = (Math.PI * 2) / count;
  const handleScale = (4 / 3) * Math.tan(step / 4);
  const angles: number[] = [];
  const radii: number[] = [];
  const handles: number[] = [];
  const vertices: number[] = [];
  for (let index = 0; index < count; index++) {
    const isInner = kind === 1 && index % 2 === 1;
    const radius = isInner ? inner : outer;
    const roundness = isInner ? innerRoundness : outerRoundness;
    const angle = rotation + index * step;
    angles.push(angle);
    radii.push(radius);
    handles.push((radius * handleScale * roundness) / 100);
    vertices.push(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius);
  }
  if (handles.every((handle) => handle === 0)) {
    appendPathPolygon(path, vertices);
    return path;
  }
  appendPathMoveTo(path, vertices[0], vertices[1]);
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    // Tangent of increasing angle at each end; the incoming handle points back along the next
    // vertex's tangent, which is why it is subtracted rather than added.
    const outgoingX = vertices[index * 2] - Math.sin(angles[index]) * handles[index];
    const outgoingY = vertices[index * 2 + 1] + Math.cos(angles[index]) * handles[index];
    const incomingX = vertices[next * 2] + Math.sin(angles[next]) * handles[next];
    const incomingY = vertices[next * 2 + 1] - Math.cos(angles[next]) * handles[next];
    appendPathCubicCurveTo(
      path,
      outgoingX,
      outgoingY,
      incomingX,
      incomingY,
      vertices[next * 2],
      vertices[next * 2 + 1],
    );
  }
  return path;
}

/**
 * Reads a Lottie polystar — star or polygon — building its path and rebinding it as its seven numeric properties
 * animate.
 *
 * ★ THE MOST EXPENSIVE GEOMETRY ITEM, AND THE ONE MOST OFTEN UNUSED. The roundness maths below is the largest single
 * shape-item body in the format, and a document of rectangles and ellipses has no use for it. It used to be two
 * branches of two switches in the document core, so every Lottie build paid for it; now it links only when a
 * caller names this handler.
 */
export function lottiePolystarShapeItemHandler(context: LottieShapeItemContext): void {
  const polystar = context.item as Readonly<LottiePolystarShapeItem>;
  const center = lottieNumericValue(initialLottieValue(polystar.p), 2);
  const points = [lottieNumericValue(initialLottieValue(polystar.pt), 1)[0]];
  const outer = [lottieNumericValue(initialLottieValue(polystar.or), 1)[0]];
  const inner = [polystar.sy === 1 ? lottieNumericValue(initialLottieValue(polystar.ir), 1)[0] : outer[0]];
  const rotation = [lottieNumericValue(initialLottieValue(polystar.r), 1)[0]];
  const outerRoundness = [polystar.os === undefined ? 0 : lottieNumericValue(initialLottieValue(polystar.os), 1)[0]];
  const innerRoundness = [
    polystar.sy === 1 && polystar.is !== undefined ? lottieNumericValue(initialLottieValue(polystar.is), 1)[0] : 0,
  ];
  const build = (): Path =>
    applyLottieShapeDirection(
      createLottiePolystarPath(
        polystar.sy,
        center,
        Math.max(2, Math.round(points[0])),
        outer[0],
        inner[0],
        rotation[0],
        outerRoundness[0],
        innerRoundness[0],
      ),
      polystar.d,
    );
  const pathIndex = context.paths.length;
  context.paths.push(build());
  const apply = (): void => {
    context.paths[pathIndex] = build();
    context.rerender();
  };
  bindMutableLottieNumericProperty(polystar.p, center, (value) => value, apply, context.import);
  bindMutableLottieNumericProperty(polystar.pt, points, (value) => value, apply, context.import);
  bindMutableLottieNumericProperty(polystar.or, outer, (value) => value, apply, context.import);
  if (polystar.ir !== undefined) {
    bindMutableLottieNumericProperty(polystar.ir, inner, (value) => value, apply, context.import);
  }
  bindMutableLottieNumericProperty(polystar.r, rotation, (value) => value, apply, context.import);
  if (polystar.os !== undefined) {
    bindMutableLottieNumericProperty(polystar.os, outerRoundness, (value) => value, apply, context.import);
  }
  if (polystar.is !== undefined) {
    bindMutableLottieNumericProperty(polystar.is, innerRoundness, (value) => value, apply, context.import);
  }
}
