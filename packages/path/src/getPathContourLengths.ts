import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';

function contourLength(contour: Readonly<number[]>): number {
  let len: number = 0.0;
  let i = 2;
  while (i < contour.length) {
    const dx = contour[i] - contour[i - 2];
    const dy = contour[i + 1] - contour[i - 1];
    len += Math.sqrt(dx * dx + dy * dy);
    i += 2;
  }
  return len;
}

/**
 * Returns an array of arc lengths, one per contour in the path.
 */
export function getPathContourLengths(path: Readonly<PathRaw>, tolerance?: number): number[] {
  const tolerance_1 = tolerance ?? 0.25;
  const contours = flattenPath(path, tolerance_1);
  let out: number[] = [] as never[];
  for (let ci = 0; ci < contours.length; ci += 1) {
    out.push(contourLength(contours[ci]));
  }
  return out;
}
