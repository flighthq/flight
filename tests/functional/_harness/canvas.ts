import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  createMatrix,
  defaultCanvasBitmapRenderer,
  defaultCanvasRichTextRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

import type { FunctionalTarget, FunctionalTargetOptions } from './target';

export function createCanvasTarget(options: Readonly<FunctionalTargetOptions>): FunctionalTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createCanvasRenderState(canvas, {
    backgroundColor: options.background,
    contextAttributes: options.contextAttributes ?? { alpha: false },
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing
  // store here. See ../README.md for why this lives in renderTransform2D rather than the scene.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
      registerCanvasShapeCommands(defaultCanvasShapeCommands);
    } else if (kind === BitmapKind) {
      registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
    }
  }

  return {
    state,
    width,
    height,
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderCanvasBackground(state);
      renderCanvasDisplayObject(state, root);
    },
  };
}
