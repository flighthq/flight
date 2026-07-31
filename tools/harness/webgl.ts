import type { Node2D } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  createMatrix,
  defaultGlParticleEmitter2DRenderer,
  defaultGlQuadBatchRenderer,
  defaultGlRichTextRenderer,
  defaultGlScale9ShapeRenderer,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlSpriteRenderer,
  defaultGlTextLabelRenderer,
  defaultGlTextureShapeCommands,
  defaultGlTilemapRenderer,
  enableGlBlendModeSupport,
  enableGlClipSupport,
  enableFlightDiagnostics,
  enableGlRenderCache,
  enableGlStrokePathTessellation,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  QuadBatchKind,
  registerStandardGlTextureResolvers,
  registerGlShapeCommands,
  registerRenderer,
  registerStandardGlMaterial,
  renderGlBackground,
  renderGlScene2D,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { FunctionalGlTarget, FunctionalTargetOptions } from './target';

export function createGlTarget(options: Readonly<FunctionalTargetOptions>): FunctionalGlTarget {
  const { width, height } = options;
  const pixelRatio = window.devicePixelRatio || 1;

  const canvas = createGlCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createGlRenderState(canvas, {
    pixelRatio,
    backgroundColor: options.background,
    // preserveDrawingBuffer so the verifier (and the differential/fingerprint runner) can read the
    // frame back after rendering — harmless for tests, where throughput does not matter.
    contextAttributes: { alpha: false, preserveDrawingBuffer: true, ...options.contextAttributes },
    sceneGraphSyncPolicy: options.syncPolicy,
  });

  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing
  // store here. See ../README.md for why this lives in renderTransform2D rather than the scene.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  enableFlightDiagnostics(state);
  registerStandardGlTextureResolvers(state);
  registerStandardGlMaterial(state);
  for (const kind of options.kinds ?? []) {
    if (kind === ShapeKind) {
      registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
      registerGlShapeCommands([...defaultGlShapeCommands, ...defaultGlTextureShapeCommands]);
    } else if (kind === RichTextKind) {
      registerRenderer(state, RichTextKind, defaultGlRichTextRenderer);
    } else if (kind === TextLabelKind) {
      registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
    } else if (kind === SpriteKind) {
      registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
    } else if (kind === ParticleEmitter2DKind) {
      registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
    } else if (kind === QuadBatchKind) {
      registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
    } else if (kind === TilemapKind) {
      registerRenderer(state, TilemapKind, defaultGlTilemapRenderer);
    } else if (kind === Scale9ShapeKind) {
      registerRenderer(state, Scale9ShapeKind, defaultGlScale9ShapeRenderer);
      registerGlShapeCommands([...defaultGlShapeCommands, ...defaultGlTextureShapeCommands]);
    }
  }

  if (options.clip) enableGlClipSupport(state);
  if (options.cache) enableGlRenderCache(state);
  if (options.blend) enableGlBlendModeSupport(state);
  if (options.strokePathTessellation) enableGlStrokePathTessellation(state);

  return registerFunctionalTarget({
    kind: 'webgl',
    state,
    width,
    height,
    scale: pixelRatio,
    render(root: Node2D): void {
      if (!prepareScene2DRender(state, root)) return;
      renderGlBackground(state);
      renderGlScene2D(state, root);
    },
    benchmark(root: Node2D): void {
      invalidateNodeLocalTransform(root);
      this.render(root);
    },
  });
}
