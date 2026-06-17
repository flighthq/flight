import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import type { DisplayObject, DOMStageRectangle, RenderProxy2D } from '@flighthq/types';

import { createDOMStageRectangle } from './domClipRectangle';

export function pushDOMMaskRectangle(rectangles: DOMStageRectangle[], data: RenderProxy2D): void {
  const bounds = getNodeLocalBoundsRectangle(data.source as DisplayObject);
  if (bounds.width <= 0 || bounds.height <= 0) {
    rectangles.push({ bottom: 0, left: 0, right: 0, top: 0 });
    return;
  }

  rectangles.push(createDOMStageRectangle(bounds, data.transform2D));
}
