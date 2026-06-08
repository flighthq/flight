import { getLocalBoundsRectangle } from '@flighthq/scene';
import type { DisplayObject, DisplayObjectRenderNode } from '@flighthq/types';

import { createDOMStageRectangle, type DOMStageRectangle } from './domClipRectangle';

export function pushDOMMaskRectangle(rectangles: DOMStageRectangle[], data: DisplayObjectRenderNode): void {
  const bounds = getLocalBoundsRectangle(data.source as DisplayObject);
  if (bounds.width <= 0 || bounds.height <= 0) {
    rectangles.push({ bottom: 0, left: 0, right: 0, top: 0 });
    return;
  }

  rectangles.push(createDOMStageRectangle(bounds, data.transform2D));
}
