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
  enableWebGPUClipSupport,
  enableWebGPUFrameCapture,
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
import { registerFunctionalTarget } from './verify';

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
  // Frame capture lets the verifier read the rendered frame back from the GPU; canvas presentation is
  // unavailable on the headless/software adapter, so this is the only path to the pixels.
  enableWebGPUFrameCapture(state);
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

  if (options.clip) enableWebGPUClipSupport(state);
  if (options.cache) enableWebGPURenderCache(state);

  return registerFunctionalTarget({
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
  });
}
