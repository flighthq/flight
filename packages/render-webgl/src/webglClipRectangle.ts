import type { MatrixLike, RectangleLike, WebGLRenderState } from '@flighthq/types';

import type { WebGLScissorRect } from './internal';
import { getWebGLRenderStateRuntime } from './webglRenderState';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';

export function popWebGLClipRectangle(state: WebGLRenderState): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const stack = getScissorStack(state);
  stack.pop();
  const previous = stack.length > 0 ? stack[stack.length - 1] : null;
  runtime.currentScissorRect = previous;
  flushWebGLSpriteBatch(state);

  const gl = state.gl;
  if (previous === null) {
    gl.disable(gl.SCISSOR_TEST);
  } else {
    gl.scissor(previous.x, previous.y, previous.width, previous.height);
  }
}

export function pushWebGLClipRectangle(
  state: WebGLRenderState,
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const next = intersectScissorRect(runtime.currentScissorRect ?? null, computeScissorRect(state, rect, transform));
  runtime.currentScissorRect = next;
  getScissorStack(state).push(next);
  flushWebGLSpriteBatch(state);

  const gl = state.gl;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(next.x, next.y, next.width, next.height);
}

function computeScissorRect(
  state: WebGLRenderState,
  rect: Readonly<RectangleLike>,
  transform: Readonly<MatrixLike>,
): WebGLScissorRect {
  const x0 = transform.a * rect.x + transform.c * rect.y + transform.tx;
  const y0 = transform.b * rect.x + transform.d * rect.y + transform.ty;
  const x1 = transform.a * (rect.x + rect.width) + transform.c * rect.y + transform.tx;
  const y1 = transform.b * (rect.x + rect.width) + transform.d * rect.y + transform.ty;
  const x2 = transform.a * rect.x + transform.c * (rect.y + rect.height) + transform.tx;
  const y2 = transform.b * rect.x + transform.d * (rect.y + rect.height) + transform.ty;
  const x3 = transform.a * (rect.x + rect.width) + transform.c * (rect.y + rect.height) + transform.tx;
  const y3 = transform.b * (rect.x + rect.width) + transform.d * (rect.y + rect.height) + transform.ty;

  const viewport = getWebGLRenderStateRuntime(state).renderTargetViewport ?? state.canvas;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3)));
  const maxX = Math.min(viewport.width, Math.ceil(Math.max(x0, x1, x2, x3)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3)));
  const maxY = Math.min(viewport.height, Math.ceil(Math.max(y0, y1, y2, y3)));

  return {
    height: Math.max(0, maxY - minY),
    width: Math.max(0, maxX - minX),
    x: minX,
    y: Math.max(0, viewport.height - maxY),
  };
}

function getScissorStack(state: WebGLRenderState): WebGLScissorRect[] {
  const runtime = getWebGLRenderStateRuntime(state);
  runtime.scissorStack ??= [];
  return runtime.scissorStack;
}

function intersectScissorRect(a: Readonly<WebGLScissorRect> | null, b: Readonly<WebGLScissorRect>): WebGLScissorRect {
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
