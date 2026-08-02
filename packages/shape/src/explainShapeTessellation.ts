import type { ShapeCommandToken, ShapeTessellationExplanation } from '@flighthq/types/contract';

import { hasNonSolidShapeFill } from './shapeFill';
import { hasNonSolidShapeStroke } from './shapeStroke';
import { getShapeStrokeOutlineRegions } from './shapeStrokeOutline';

// Reports whether a command stream can be drawn as mesh regions, and what stops it when it cannot.
//
// `strokePathTessellationEnabled` selects which stroke lane the answer describes, because the two
// differ on exactly the case that catches authors out: the default lane declines a closed stroke — the
// outline of any rectangle, circle, or closed path — while the opt-in stroke-path tessellator expresses
// it. Fill alpha never matters to either; a solid fill tessellates at any alpha, including zero.
export function explainShapeTessellation(
  commands: readonly ShapeCommandToken[],
  strokePathTessellationEnabled = false,
): ShapeTessellationExplanation {
  if (hasNonSolidShapeFill(commands)) return { blockedBy: 'non-solid-fill', status: 'needs-rasterizer' };
  if (hasNonSolidShapeStroke(commands)) return { blockedBy: 'non-solid-stroke', status: 'needs-rasterizer' };
  if (!strokePathTessellationEnabled && getShapeStrokeOutlineRegions(commands) === null) {
    return { blockedBy: 'stroke-outline', status: 'needs-rasterizer' };
  }
  return { blockedBy: 'none', status: 'tessellates' };
}
