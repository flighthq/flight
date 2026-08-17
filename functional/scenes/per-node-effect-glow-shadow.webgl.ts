import { setGlRenderTransform2D } from '@flighthq/render-gl/contract';
import type { Bitmap, RenderEffect, RenderEffectPadding, RenderTexture } from '@flighthq/sdk';
import {
  ShapeKind,
  SpriteKind,
  acquireGlRenderTexture,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  applyGlRenderEffectsToRenderTexture,
  computeRenderEffectPadding,
  createDisplayObject,
  createDropShadowEffect,
  createGlOffscreenRenderState,
  createGlRenderTexturePool,
  createMatrix,
  createOuterGlowEffect,
  createShape,
  createSprite,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  registerDropShadowEffectPaddingResolver,
  registerGlDropShadowEffect,
  registerGlOuterGlowEffect,
  registerOuterGlowEffectPaddingResolver,
  releaseGlRenderTexture,
  renderGlScene2D,
  renderIntoGlRenderTexture,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const CONTENT_WIDTH = 70;
const CONTENT_HEIGHT = 60;
const GLOW_X = 185;
const SHADOW_X = 475;
const RESULT_Y = 250;
const BACKING = 0x292440ff;

export const minCoverage = 0;

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x111522ff,
  kinds: [ShapeKind, SpriteKind],
  expectedImageDescription:
    'An 800x600 field on a very dark blue-black background with one dark purple backing panel spanning ' +
    'x 125-645, y 190-410, and two bright cyan blocks of about 70x60 sitting on it, one near x 185 and ' +
    'one near x 475, both around y 250. Each cyan block is surrounded differently, and the asymmetry is ' +
    'the whole claim. The LEFT block has a pink halo on BOTH sides — a few pixels out from its left edge ' +
    'and a few pixels out from its right edge are both pink, so the glow surrounds it evenly. The RIGHT ' +
    'block instead throws a purple shadow to ONE SIDE ONLY: about a dozen pixels past its right edge is ' +
    'purple, while just inside the left of its own area the backing is plain dark purple with no shadow ' +
    'at all. A pink halo around the right block, a symmetric shadow, or a shadow falling on the left is ' +
    'the failure. Both block centres are solid cyan.',
});
if (target.kind !== 'webgl') throw new Error('per-node-effect-glow-shadow requires WebGL');
const { render, state, width } = target;

const offscreenState = createGlOffscreenRenderState(state);
const pool = createGlRenderTexturePool();
registerGlOuterGlowEffect(offscreenState);
registerGlDropShadowEffect(offscreenState);
registerOuterGlowEffectPaddingResolver(offscreenState);
registerDropShadowEffectPaddingResolver(offscreenState);

const glow = createOuterGlowEffect({ alpha: 1, blurX: 8, blurY: 8, color: 0xff315fff, strength: 1 });
const shadow = createDropShadowEffect({
  alpha: 1,
  angle: 0,
  blurX: 4,
  blurY: 4,
  color: 0x9d55ffff,
  distance: 18,
  strength: 1,
});
const glowPadding = computeRenderEffectPadding(offscreenState, [glow]);
const shadowPadding = computeRenderEffectPadding(offscreenState, [shadow]);
const glowTexture = capture(glow, glowPadding);
const shadowTexture = capture(shadow, shadowPadding);

const root = createDisplayObject();
addRect(root, 125, 190, 520, 220, BACKING);
addResult(root, glowTexture, GLOW_X, RESULT_Y);
addResult(root, shadowTexture, SHADOW_X, RESULT_Y);
render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));
  const failures: string[] = [];

  const glowContentLeft = GLOW_X + glowPadding.left;
  const glowContentTop = RESULT_Y + glowPadding.top;
  const glowCenter = at(glowContentLeft + CONTENT_WIDTH / 2, glowContentTop + CONTENT_HEIGHT / 2);
  const glowLeft = at(glowContentLeft - 7, glowContentTop + CONTENT_HEIGHT / 2);
  const glowRight = at(glowContentLeft + CONTENT_WIDTH + 7, glowContentTop + CONTENT_HEIGHT / 2);
  if (!isCyan(glowCenter) || !isPink(glowLeft) || !isPink(glowRight)) {
    failures.push(`glow source/padding probes failed — #${hex(glowCenter)} / #${hex(glowLeft)} / #${hex(glowRight)}`);
  }

  const shadowContentLeft = SHADOW_X + shadowPadding.left;
  const shadowContentTop = RESULT_Y + shadowPadding.top;
  const shadowCenter = at(shadowContentLeft + CONTENT_WIDTH / 2, shadowContentTop + CONTENT_HEIGHT / 2);
  const shadowRight = at(shadowContentLeft + CONTENT_WIDTH + 13, shadowContentTop + CONTENT_HEIGHT / 2);
  const shadowLeft = at(SHADOW_X + 3, shadowContentTop + CONTENT_HEIGHT / 2);
  if (!isCyan(shadowCenter) || !isPurple(shadowRight) || !isBacking(shadowLeft)) {
    failures.push(
      `directional shadow probes failed — #${hex(shadowCenter)} / #${hex(shadowRight)} / #${hex(shadowLeft)}`,
    );
  }
  if (failures.length > 0) throw new Error(`[per-node-effect-glow-shadow] ${failures.join('; ')}`);
}

function capture(effect: Readonly<RenderEffect>, padding: Readonly<RenderEffectPadding>): RenderTexture {
  const descriptor = {
    clearColors: [0x00000000],
    depth: 'none' as const,
    height: CONTENT_HEIGHT + padding.top + padding.bottom,
    width: CONTENT_WIDTH + padding.left + padding.right,
  };
  const sourceTexture = acquireGlRenderTexture(state, pool, descriptor);
  const destTexture = acquireGlRenderTexture(state, pool, descriptor);
  const scratchTexture = acquireGlRenderTexture(state, pool, descriptor);
  const source = createShape();
  appendShapeBeginFill(source, 0x43dce8ff, 1);
  appendShapeRectangle(source, padding.left, padding.top, CONTENT_WIDTH, CONTENT_HEIGHT);
  appendShapeEndFill(source);
  renderIntoGlRenderTexture(offscreenState, sourceTexture, (captureState) => {
    setGlRenderTransform2D(captureState, createMatrix());
    prepareScene2DRender(captureState, source);
    renderGlScene2D(captureState, source);
  });
  if (
    !applyGlRenderEffectsToRenderTexture(offscreenState, pool, sourceTexture, destTexture, scratchTexture, [effect])
  ) {
    throw new Error(`[per-node-effect-glow-shadow] ${effect.kind} did not run`);
  }
  releaseGlRenderTexture(state, pool, scratchTexture);
  releaseGlRenderTexture(state, pool, sourceTexture);
  return destTexture;
}

function addResult(parent: ReturnType<typeof createDisplayObject>, texture: RenderTexture, x: number, y: number): void {
  const sprite = createSprite({ data: { texture } });
  sprite.x = x;
  sprite.y = y;
  invalidateNodeLocalTransform(sprite);
  addNodeChild(parent, sprite);
}

function addRect(
  parent: ReturnType<typeof createDisplayObject>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
): void {
  const shape = createShape();
  appendShapeBeginFill(shape, color, 1);
  appendShapeRectangle(shape, x, y, width, height);
  appendShapeEndFill(shape);
  addNodeChild(parent, shape);
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}

function isBacking(rgb: number): boolean {
  return channel(rgb, 16) > 25 && channel(rgb, 16) < 65 && channel(rgb, 8) < 65 && channel(rgb, 0) > 35;
}

function isCyan(rgb: number): boolean {
  return channel(rgb, 16) < 110 && channel(rgb, 8) > 150 && channel(rgb, 0) > 160;
}

function isPink(rgb: number): boolean {
  return channel(rgb, 16) > 65 && channel(rgb, 16) > channel(rgb, 8) * 1.45;
}

function isPurple(rgb: number): boolean {
  return channel(rgb, 0) > 90 && channel(rgb, 16) > 55 && channel(rgb, 0) > channel(rgb, 8) * 1.2;
}
