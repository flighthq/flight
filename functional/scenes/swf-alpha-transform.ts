// swf-alpha-transform — renders authored PlaceObject2 CXFORMWITHALPHA records rather than assigning
// Flight appearance fields directly. Three red overlays sit on blue backdrops: opaque red, red with a
// half alpha multiplier, and red with a zero multiplier plus a non-zero alpha add. Every backend renders
// these three alpha cases with the same result; RGB color-transform realization is isolated in
// swf-color-transform.

import { getRenderProxy2D } from '@flighthq/render/contract';
import type { Bitmap, Shape } from '@flighthq/sdk';
import { getBitmapPixelRgb, getNodeChildren, logInfo, ShapeKind } from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

import { createSwfAlphaTransformMovieClip } from '../helpers/swfTransformFixture';

const WIDTH = 490;
const HEIGHT = 220;
const BACKGROUND = 0x000000ff;
const SQUARE = 100;
const Y = 60;
const SAMPLE_X = [40, 190, 340] as const;

let backend: 'canvas' | 'dom' | 'webgl' | 'webgpu' = 'canvas';
let domHalfOpacity: string | null = null;
let targetWidth = WIDTH;

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / targetWidth;
  const at = (column: number): number =>
    getBitmapPixelRgb(frame, Math.round((SAMPLE_X[column] + SQUARE / 2) * scale), Math.round((Y + SQUARE / 2) * scale));

  const control = at(0);
  const halfMultiply = at(1);
  const zeroMultiplyWithAdd = at(2);
  logInfo(
    {
      backend,
      control: hex(control),
      halfMultiply: hex(halfMultiply),
      zeroMultiplyWithAdd: hex(zeroMultiplyWithAdd),
    },
    'test',
  );

  if (!isRed(control)) {
    throw new Error(`[swf-alpha-transform/${backend}] opaque control is not red — got #${hex(control)}`);
  }
  if (!isHalfRedOverBlue(halfMultiply)) {
    throw new Error(
      `[swf-alpha-transform/${backend}] alpha multiplier did not blend red halfway over blue — got #${hex(halfMultiply)}`,
    );
  }
  if (!isBlue(zeroMultiplyWithAdd)) {
    throw new Error(
      `[swf-alpha-transform/${backend}] m=0 plus non-zero alpha-add was not culled — got #${hex(zeroMultiplyWithAdd)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBlue(rgb: number): boolean {
  return channel(rgb, 16) < 40 && channel(rgb, 8) < 40 && channel(rgb, 0) > 210;
}

function isHalfRedOverBlue(rgb: number): boolean {
  const red = channel(rgb, 16);
  const green = channel(rgb, 8);
  const blue = channel(rgb, 0);
  return red >= 105 && red <= 150 && green < 40 && blue >= 105 && blue <= 150;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 210 && channel(rgb, 8) < 40 && channel(rgb, 0) < 40;
}

const root = createSwfAlphaTransformMovieClip();
const children = getNodeChildren(root);
if (children.length !== 6 || children.some((child) => child.kind !== ShapeKind)) {
  throw new Error(`[swf-alpha-transform] expected six imported solid shapes, got ${children.length}`);
}

const halfAlpha = children[3] as Shape;
const zeroAlphaAdd = children[5] as Shape;
if (Math.abs(halfAlpha.alpha - 0.5) > 0.0001) {
  throw new Error(`[swf-alpha-transform] half-alpha CXFORM imported node alpha ${halfAlpha.alpha}, expected 0.5`);
}
if (zeroAlphaAdd.alpha !== 0) {
  throw new Error(`[swf-alpha-transform] zero-multiply CXFORM imported node alpha ${zeroAlphaAdd.alpha}, expected 0`);
}

declareAntialiasingPolicy('aa');

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: BACKGROUND,
  kinds: [ShapeKind],
  expectedImageDescription:
    'A 490x220 opaque black field with three 100x100 squares in a row at y 60-160, at x 40-140, 190-290 ' +
    'and 340-440, each sitting on a blue backdrop of its own size. Left to right: the first is flat opaque ' +
    'red; the second is red at half strength over blue, reading as a muted purple that is clearly neither ' +
    'pure red nor pure blue; the third is plain blue, because the overlay above it contributes nothing at ' +
    'all — any red or pink in the third square is a failure. All three squares look the same on every ' +
    'backend, and nothing is drawn outside them.',
});
backend = target.kind;
targetWidth = target.width;
target.render(root);

const halfAlphaProxy = getRenderProxy2D(target.state, halfAlpha);
if (halfAlphaProxy === undefined || Math.abs(halfAlphaProxy.alpha - 0.5) > 0.0001) {
  throw new Error('[swf-alpha-transform] imported alpha multiplier did not reach the half-alpha render proxy');
}
if (target.kind === 'dom') {
  // The DOM shape renderer owns a canvas element through backend-private renderer data; this assertion
  // proves the imported alpha reached the host element rather than only the shared render proxy.
  const data = halfAlphaProxy.rendererData as unknown as { canvas: HTMLCanvasElement | null } | null;
  domHalfOpacity = data?.canvas?.style.opacity ?? null;
  if (domHalfOpacity !== '0.5') {
    throw new Error(`[swf-alpha-transform/dom] shape renderer did not apply opacity 0.5 — got ${domHalfOpacity}`);
  }
}
logInfo(
  {
    backend,
    domHalfOpacity,
    importedHalfAlpha: halfAlpha.alpha,
    importedZeroAlpha: zeroAlphaAdd.alpha,
  },
  'test',
);
