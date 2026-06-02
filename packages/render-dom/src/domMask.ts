import { getLocalBoundsRectangle } from '@flighthq/scene-core';
import type { DisplayObjectRenderTreeNode } from '@flighthq/types';

import { createDOMStageRectangle, type DOMStageRectangle } from './domClipRect';

export function pushDOMMaskRectangle(rectangles: DOMStageRectangle[], data: DisplayObjectRenderTreeNode): void {
  const bounds = getLocalBoundsRectangle(data.source);
  if (bounds.width <= 0 || bounds.height <= 0) {
    rectangles.push({ bottom: 0, left: 0, right: 0, top: 0 });
    return;
  }

  rectangles.push(createDOMStageRectangle(bounds, data.transform2D));
}
