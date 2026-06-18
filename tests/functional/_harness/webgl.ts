import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createMatrix,
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLBitmapRenderer,
  defaultWebGLRichTextRenderer,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  enableWebGLClipRectangleSupport,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

import type { FunctionalTarget, FunctionalTargetOptions } from './target';

export function createWebGLTarget(options: Readonly<FunctionalTargetOptions>): FunctionalTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createWebGLCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createWebGLRenderState(canvas, {
    pixelRatio,
    backgroundColor: options.background,
    contextAttributes: options.contextAttributes ?? { alpha: false },
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing
  // store here. See ../README.md for why this lives in renderTransform2D rather than the scene.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  registerDefaultWebGLMaterial(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
      registerWebGLShapeCommands(defaultWebGLShapeCommands);
    } else if (kind === BitmapKind) {
      registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultWebGLRichTextRenderer);
    }
  }

  if (options.clip) enableWebGLClipRectangleSupport(state);

  return {
    state,
    width,
    height,
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderWebGLBackground(state);
      renderWebGLDisplayObject(state, root);
    },
  };
}
