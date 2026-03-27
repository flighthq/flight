import { getSpriteRenderNode } from '@flighthq/render-core';
import { getSpriteNodeRuntime } from '@flighthq/scene-graph-sprite';
import type { CanvasRenderState, SpriteNode, SpriteRenderNode } from '@flighthq/types';

export function renderSprite(state: CanvasRenderState, source: SpriteNode): void {
  // const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;
  let stackLength = 0;

  // Start with root
  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    const data = getSpriteRenderNode(state, current);

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    // ── Draw current object first (pre-order) ──
    drawObject(state, data);

    // Then push children in forward order (so we pop & draw index 0 first)
    const children = getSpriteNodeRuntime(current).children;
    if (children !== null) {
      // Push from last to first → pop gives index 0 first
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as SpriteNode;
      }
    }
  }
}

function drawObject(state: CanvasRenderState, data: SpriteRenderNode): void {
  if (data.renderer === null) return;
  data.renderer.draw(state, data);
}
