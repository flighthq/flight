import { createPath, reversePath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/types/contract';

/**
 * Applies a Lottie shape item's direction flag, which is the one thing every geometry item does identically.
 *
 * ★ FOUR OWNERS, WHICH IS WHY IT IS SHARED. Rectangle, ellipse, polystar and path each build their own geometry in
 * their own module and each end by honouring `d`. Nothing outside those four imports this, so a build with only
 * fills and strokes links none of it — which a single shared helpers file for all shape code could not offer.
 */
export function applyLottieShapeDirection(path: Path, direction: 1 | 3 | undefined): Path {
  if (direction !== 3) return path;
  const reversed = createPath(path.winding);
  reversePath(path, reversed);
  return reversed;
}
