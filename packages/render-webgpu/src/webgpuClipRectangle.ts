import type { MatrixLike, RectangleLike } from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUScissorRect } from './internal';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

export function popWebGPUClipRectangle(state: WebGPURenderStateInternal): void {
  flushWebGPUSpriteBatch(state);
  const stack = state.scissorStack;
  stack.pop();
  const previous = stack.length > 0 ? stack[stack.length - 1] : null;
  state.currentScissorRect = previous;

  const pass = state.renderPass;
  if (pass === null) return;

  if (previous === null) {
    const viewport = state.renderTargetViewport ?? state.canvas;
    pass.setScissorRect(0, 0, viewport.width, viewport.height);
  } else if (previous.width <= 0 || previous.height <= 0) {
    // Empty intersection stored during push — maintain degenerate scissor until fully popped.
    pass.setScissorRect(0, 0, 1, 1);
  } else {
    pass.setScissorRect(previous.x, previous.y, previous.width, previous.height);
  }
}

export function pushWebGPUClipRectangle(
  state: WebGPURenderStateInternal,
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): void {
  flushWebGPUSpriteBatch(state);
  const next = intersectWebGPUScissorRect(
    state.currentScissorRect ?? null,
    computeWebGPUScissorRect(state, rect, transform),
  );
  state.currentScissorRect = next;
  state.scissorStack.push(next);

  const pass = state.renderPass;
  if (pass === null) return;
  if (next.width <= 0 || next.height <= 0) {
    // Clip rect projects entirely outside the viewport — use a 1×1 degenerate scissor at
    // the origin so the node is effectively invisible while the rect remains WebGPU-valid.
    pass.setScissorRect(0, 0, 1, 1);
  } else {
    pass.setScissorRect(next.x, next.y, next.width, next.height);
  }
}

function computeWebGPUScissorRect(
  state: WebGPURenderStateInternal,
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): WebGPUScissorRect {
  const x0 = transform.a * rect.x + transform.c * rect.y + transform.tx;
  const y0 = transform.b * rect.x + transform.d * rect.y + transform.ty;
  const x1 = transform.a * (rect.x + rect.width) + transform.c * rect.y + transform.tx;
  const y1 = transform.b * (rect.x + rect.width) + transform.d * rect.y + transform.ty;
  const x2 = transform.a * rect.x + transform.c * (rect.y + rect.height) + transform.tx;
  const y2 = transform.b * rect.x + transform.d * (rect.y + rect.height) + transform.ty;
  const x3 = transform.a * (rect.x + rect.width) + transform.c * (rect.y + rect.height) + transform.tx;
  const y3 = transform.b * (rect.x + rect.width) + transform.d * (rect.y + rect.height) + transform.ty;

  const viewport = state.renderTargetViewport ?? state.canvas;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3)));
  const maxX = Math.min(viewport.width, Math.ceil(Math.max(x0, x1, x2, x3)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3)));
  const maxY = Math.min(viewport.height, Math.ceil(Math.max(y0, y1, y2, y3)));

  // WebGPU uses top-left origin for scissor, same as the canvas coordinate system
  return {
    height: Math.max(0, maxY - minY),
    width: Math.max(0, maxX - minX),
    x: minX,
    y: minY,
  };
}

function intersectWebGPUScissorRect(
  a: Readonly<WebGPUScissorRect> | null,
  b: Readonly<WebGPUScissorRect>,
): WebGPUScissorRect {
  if (a === null) return { height: b.height, width: b.width, x: b.x, y: b.y };

  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  };
}
