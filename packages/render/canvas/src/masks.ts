import { rectangle } from '@flighthq/geometry';
import { getRenderNode } from '@flighthq/render-core';
import { calculateBoundsRect } from '@flighthq/scene-graph-stage';
import type { CanvasRendererState, RenderNode } from '@flighthq/types';

import { setTransform } from './transform';
// import * as shape from './type/shape';

export function applyMask(state: CanvasRendererState, data: RenderNode): void {
  const source = data.source;
  const type = source.type;
  if (source.opaqueBackground !== null || type === 'bitmap' || type === 'video') {
    calculateBoundsRect(tempBounds, source, source);
    state.context.rect(0, 0, tempBounds.width, tempBounds.width);
  } else {
    switch (type) {
      // case 'shape':
      //   shape.applyMask(state, data);
      //   break;
      case 'container':
      case 'stage':
        const children = source.children;
        if (children !== null) {
          for (let i = 0; i < children.length; i++) {
            const data = getRenderNode(state, children[i]);
            applyMask(state, data);
          }
        }
        break;
      default:
    }
  }
}

export function popMask(state: CanvasRendererState): void {
  state.context.restore();
  // state.currentMaskDepth--;
}

export function pushMask(state: CanvasRendererState, data: RenderNode): void {
  state.context.save();

  setTransform(state, state.context, data.transform);

  state.context.beginPath();
  applyMask(state, data);
  state.context.closePath();

  state.context.clip();
}

const tempBounds = rectangle.create();
