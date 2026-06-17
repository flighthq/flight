import { appendShapeRectangle, createShape } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { getOrCreateRenderNode2D } from '@flighthq/render';
import type { DOMStageRectangle } from '@flighthq/types';

import { pushDOMMaskRectangle } from './domMask';
import { createDOMRenderState } from './domRenderState';

describe('pushDOMMaskRectangle', () => {
  it('pushes the transformed local bounds of the mask source', () => {
    const state = createDOMRenderState(document.createElement('div'));
    const mask = createShape();
    appendShapeRectangle(mask, 10, 20, 30, 40);
    const data = getOrCreateRenderNode2D(state, mask);
    data.transform2D = createMatrix(1, 0, 0, 1, 5, 6);
    const rectangles: DOMStageRectangle[] = [];

    pushDOMMaskRectangle(rectangles, data);

    expect(rectangles).toEqual([{ bottom: 66, left: 15, right: 45, top: 26 }]);
  });
});
