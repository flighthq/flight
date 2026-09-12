import { createApplicationRenderView, detachApplicationRenderView } from '@flighthq/application/contract';
import { createWebGlContext } from '@flighthq/host-web/contract';
import { createViewport } from '@flighthq/node/contract';
import {
  createGlRenderState,
  createGlTextureRenderTarget,
  destroyGlRenderState,
  destroyGlTextureRenderTarget,
  invalidateGlRenderStateCache,
  resizeGlTextureRenderTarget,
} from '@flighthq/render-gl/contract';
import type {
  ApplicationWindow,
  GlApplicationRenderView,
  GlApplicationRenderViewOptions,
  GlRenderState,
  GlTextureRenderTarget,
} from '@flighthq/types/contract';

// Allocates the GL realization of an ApplicationRenderView. Creation does not attach the resize signal;
// call attachApplicationRenderView explicitly when the window should drive subsequent synchronization.
// The returned view owns the state and target allocated here; destroy it with
// destroyGlApplicationRenderView.
export function createGlApplicationRenderView(
  window: ApplicationWindow,
  canvas: HTMLCanvasElement,
  options: Readonly<GlApplicationRenderViewOptions>,
): GlApplicationRenderView {
  const width = Math.max(0, Math.round(window.width * window.devicePixelRatio));
  const height = Math.max(0, Math.round(window.height * window.devicePixelRatio));
  synchronizeGlCanvasBackingStore(canvas, width, height);

  const context = createWebGlContext(canvas, options.context);
  const renderState = createGlRenderState(context, options.pipeline, {
    ...options.render,
    pixelRatio: window.devicePixelRatio,
  });
  const renderTarget = createGlTextureRenderTarget(renderState, {
    ...options.target,
    height,
    width,
  });
  const viewport = createViewport({
    devicePixelRatio: window.devicePixelRatio,
    height,
    width,
  });
  return createApplicationRenderView(
    window,
    renderState,
    renderTarget,
    viewport,
    (state, target, nextWidth, nextHeight) =>
      resizeGlApplicationRenderView(canvas, state, target, nextWidth, nextHeight),
  );
}

// Detaches window observation and deterministically frees the target and state owned by
// createGlApplicationRenderView. The canvas and ApplicationWindow remain caller-owned.
export function destroyGlApplicationRenderView(view: GlApplicationRenderView): void {
  detachApplicationRenderView(view);
  destroyGlTextureRenderTarget(view.renderTarget);
  destroyGlRenderState(view.renderState);
}

function resizeGlApplicationRenderView(
  canvas: HTMLCanvasElement,
  renderState: GlRenderState,
  renderTarget: GlTextureRenderTarget,
  width: number,
  height: number,
): void {
  if (synchronizeGlCanvasBackingStore(canvas, width, height)) {
    invalidateGlRenderStateCache(renderState);
  }
  const storageWidth = Math.max(1, Math.ceil(width));
  const storageHeight = Math.max(1, Math.ceil(height));
  if (renderTarget.width !== storageWidth || renderTarget.height !== storageHeight) {
    resizeGlTextureRenderTarget(renderState, renderTarget, width, height);
  }
}

function synchronizeGlCanvasBackingStore(canvas: HTMLCanvasElement, width: number, height: number): boolean {
  let changed = false;
  if (canvas.width !== width) {
    canvas.width = width;
    changed = true;
  }
  if (canvas.height !== height) {
    canvas.height = height;
    changed = true;
  }
  return changed;
}
