import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  createMatrix,
  defaultCanvasBitmapRenderer,
  defaultCanvasParticleEmitterRenderer,
  defaultCanvasQuadBatchRenderer,
  defaultCanvasRichTextRenderer,
  defaultCanvasScale9ShapeRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasSpriteRenderer,
  defaultCanvasTextLabelRenderer,
  defaultCanvasTilemapRenderer,
  defaultCanvasVideoRenderer,
  enableCanvasBlendMode,
  enableCanvasClip,
  enableCanvasRenderCache,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  QuadBatchKind,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalCanvasTarget, FunctionalTargetOptions } from './target';

export function createCanvasTarget(options: Readonly<FunctionalTargetOptions>): FunctionalCanvasTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createCanvasRenderState(canvas, {
    pixelRatio,
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
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
    } else if (kind === ParticleEmitterKind) {
      registerRenderer(state, ParticleEmitterKind, defaultCanvasParticleEmitterRenderer);
    } else if (kind === QuadBatchKind) {
      registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerRenderer(state, TilemapKind, defaultCanvasTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultCanvasScale9ShapeRenderer);
      // Scale9 rasterizes its nine patches through the same canvas shape commands as Shape.
      registerCanvasShapeCommands(defaultCanvasShapeCommands);
    } else if (kind === VideoKind) {
      registerRenderer(state, VideoKind, defaultCanvasVideoRenderer);
    }
  }

  if (options.clip) enableCanvasClip(state);
  if (options.cache) enableCanvasRenderCache(state);
  if (options.blend) enableCanvasBlendMode(state);

  return registerFunctionalTarget({
    kind: 'canvas',
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: DisplayObject): void {
      if (!prepareDisplayObjectRender(state, root)) return;
      renderCanvasBackground(state);
      renderCanvasDisplayObject(state, root);
    },
  });
}
