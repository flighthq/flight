import type { DisplayObject, GlRenderEffectPipeline, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  AdvancedBlendMode,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  beginGlRenderPass,
  createBlendEffect,
  createDisplayContainer,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGlRenderTarget,
  createShape,
  defaultGlBlendEffectRunner,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  endGlRenderPass,
  getSurfacePixelRgb,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlBlendEffectBackdrop,
  registerGlRenderEffect,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
} from '@flighthq/sdk';

// effect-blend-advanced — pixel-level coverage of the advanced-blend BlendEffect on GL (glBlendEffect),
// the composite recipe the fixed-function BlendMode enum deliberately excludes. The BlendEffect samples an
// incoming LAYER (the pipeline's rendered foreground) and a registered BACKDROP texture, computes a
// destination-reading blend, and composites the result. Difference mode (|layer - backdrop|) gives an
// unmistakable pixel signature: where layer == backdrop the output is BLACK, and where they differ the
// output is their absolute difference — neither of which a source-over passthrough would produce.
//
// The backdrop is rendered once into a standalone GL target and registered under a key; the foreground is
// rendered into the pipeline; end() runs the BlendEffect over both. The oracle samples three regions:
//   - overlap of equal colours (white-over-white) → ~black (the Difference signature),
//   - layer-only over black backdrop → the layer colour unchanged (|c - 0| = c),
//   - backdrop-only region → passes through as the layer is transparent there, reading ~backdrop colour.
// A passthrough (blend not applied) would leave the white foreground white in the overlap — the failing case.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x000000ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerDefaultGlMaterial(state);
registerGlRenderEffect(state, 'BlendEffect', defaultGlBlendEffectRunner);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba8',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const BACKDROP_KEY = 'scene';

// Renders `root` into a fresh standalone target and registers its resolved texture as the blend backdrop.
// The target's lifetime spans the whole scene (the effect samples it during end()), so it is retained on
// the module rather than released. Cleared to opaque black so the "backdrop-only" quadrant reads as black.
function renderBackdrop(root: DisplayObject): GlRenderTarget {
  const target = createGlRenderTarget(state, {
    width: state.canvas.width,
    height: state.canvas.height,
    format: 'rgba8',
    clearColors: [0x000000ff],
  });
  prepareDisplayObjectRender(state, root);
  beginGlRenderPass(state, target);
  renderGlDisplayObject(state, root);
  endGlRenderPass(state);
  registerGlBlendEffectBackdrop(state, BACKDROP_KEY, target.texture);
  return target;
}

export function render(layerRoot: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, layerRoot)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, layerRoot);
  endGlRenderEffectPipeline(state, pipeline, [
    createBlendEffect(AdvancedBlendMode.Difference, { backdropKey: BACKDROP_KEY }),
  ]);
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;

function fillRectShape(color: number, x: number, y: number, w: number, h: number): DisplayObject {
  const shape = createShape();
  appendShapeBeginFill(shape, color, 1);
  appendShapeRectangle(shape, 0, 0, w, h);
  appendShapeEndFill(shape);
  shape.x = x;
  shape.y = y;
  return shape;
}

// The BACKDROP: a white block filling the LEFT half of the frame (the rest stays cleared black).
const backdropRoot = createDisplayContainer();
backdropRoot.scaleX = scale;
backdropRoot.scaleY = scale;
addNodeChild(backdropRoot, fillRectShape(0xffffffff, 0, 0, logicalWidth * 0.5, logicalHeight));
const backdropTarget = renderBackdrop(backdropRoot);

// The LAYER (foreground): a white block filling the TOP half of the frame. Its intersection with the
// backdrop (top-left) is white-over-white → Difference black; its top-right (over black backdrop) stays
// white (|white - black| = white). The bottom-left is backdrop-only (layer transparent) → passes the
// backdrop white through; the bottom-right is empty in both.
const layerRoot = createDisplayContainer();
layerRoot.scaleX = scale;
layerRoot.scaleY = scale;
addNodeChild(layerRoot, fillRectShape(0xffffffff, 0, 0, logicalWidth, logicalHeight * 0.5));

render(layerRoot);

// Keep the backdrop target reachable for the frame (referenced by the registered backdrop texture).
void backdropTarget;

export function assertRender(surface: Readonly<Surface>): void {
  const w = surface.width;
  const h = surface.height;
  const isNear = (rgb: number, r: number, g: number, b: number, tol: number): boolean => {
    const dr = ((rgb >> 16) & 255) - r;
    const dg = ((rgb >> 8) & 255) - g;
    const db = (rgb & 255) - b;
    return Math.abs(dr) <= tol && Math.abs(dg) <= tol && Math.abs(db) <= tol;
  };
  const hex = (rgb: number): string => (rgb & 0xffffff).toString(16).padStart(6, '0');

  // Top-left: white layer over white backdrop → Difference black. THIS is the discriminating probe — a
  // passthrough (blend not applied) would leave it white.
  const tl = getSurfacePixelRgb(surface, Math.floor(w * 0.25), Math.floor(h * 0.25));
  if (!isNear(tl, 0, 0, 0, 24)) {
    throw new Error(
      `[effect-blend-advanced] overlap (white over white) is #${hex(tl)}, expected ~black — Difference blend not applied (passthrough)`,
    );
  }

  // Top-right: white layer over black backdrop → |white - black| = white.
  const tr = getSurfacePixelRgb(surface, Math.floor(w * 0.75), Math.floor(h * 0.25));
  if (!isNear(tr, 255, 255, 255, 24)) {
    throw new Error(
      `[effect-blend-advanced] layer-over-black is #${hex(tr)}, expected ~white — the layer did not composite`,
    );
  }

  // Bottom-left: backdrop-only (layer transparent) → the backdrop white passes through.
  const bl = getSurfacePixelRgb(surface, Math.floor(w * 0.25), Math.floor(h * 0.75));
  if (!isNear(bl, 255, 255, 255, 24)) {
    throw new Error(
      `[effect-blend-advanced] backdrop-only region is #${hex(bl)}, expected ~white — the backdrop was not sampled`,
    );
  }
}
