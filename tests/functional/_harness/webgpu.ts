import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createMatrix,
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUBitmapRenderer,
  defaultWebGPURichTextRenderer,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  enableWebGPUClipRectangleSupport,
  enableWebGPURenderCache,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  registerWebGPUShapeCommands,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  RichTextKind,
  ShapeKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import type { FunctionalTargetOptions, FunctionalWebGPUTarget } from './target';

export async function createWebGPUTarget(options: Readonly<FunctionalTargetOptions>): Promise<FunctionalWebGPUTarget> {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createWebGPUCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = await createWebGPURenderState(canvas, {
    pixelRatio,
    backgroundColor: options.background,
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  registerDefaultWebGPUMaterial(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
      registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
    } else if (kind === BitmapKind) {
      registerRenderer(state, BitmapKind, defaultWebGPUBitmapRenderer);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultWebGPURichTextRenderer);
    }
  }

  if (options.clip) enableWebGPUClipRectangleSupport(state);
  if (options.cache) enableWebGPURenderCache(state);

  return {
    kind: 'webgpu',
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderWebGPUBackground(state);
      renderWebGPUDisplayObject(state, root);
      submitWebGPURenderPass(state);
    },
  };
}
