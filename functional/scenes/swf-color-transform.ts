// swf-color-transform — isolates the unresolved RGB arm of an authored PlaceObject2 CXFORMWITHALPHA.
// WebGL and WebGPU fold the imported RGB transform into tessellated solid-shape data and render green;
// Canvas and DOM do not realize that fold and render the white source. One shared scene preserves the
// open architecture question without manufacturing per-backend copies that appear to agree.

import { getRenderProxy2D } from '@flighthq/render/contract';
import type { Bitmap, ColorScaleBias, Shape, WgpuShapeRendererData } from '@flighthq/sdk';
import {
  getBitmapPixelRgb,
  getNodeChildren,
  logInfo,
  registerGlColorAdjustmentMaterialFeature,
  registerWgpuColorAdjustmentMaterialFeature,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

import { createSwfColorTransformMovieClip } from '../helpers/swfTransformFixture';

const WIDTH = 220;
const HEIGHT = 220;
const BACKGROUND = 0x000000ff;
const SQUARE = 100;
const X = 60;
const Y = 60;

let backend: 'canvas' | 'dom' | 'webgl' | 'webgpu' = 'canvas';
let targetWidth = WIDTH;
let wgpuMeshCount: number | null = null;
let wgpuRasterSurfaceAllocated: boolean | null = null;

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / targetWidth;
  const rgbTransform = getBitmapPixelRgb(
    frame,
    Math.round((X + SQUARE / 2) * scale),
    Math.round((Y + SQUARE / 2) * scale),
  );
  logInfo(
    {
      backend,
      rgbTransform: hex(rgbTransform),
      wgpuMeshCount,
      wgpuRasterSurfaceAllocated,
    },
    'test',
  );

  const expectsGreen = backend === 'webgl' || backend === 'webgpu';
  if (expectsGreen ? !isGreen(rgbTransform) : !isWhite(rgbTransform)) {
    const expected = expectsGreen ? 'green (folded RGB transform)' : 'white (no GPU adjustment fold)';
    throw new Error(`[swf-color-transform/${backend}] adjusted solid is not ${expected} — got #${hex(rgbTransform)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 40 && channel(rgb, 8) > 210 && channel(rgb, 0) < 40;
}

function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 210 && channel(rgb, 8) > 210 && channel(rgb, 0) > 210;
}

function isGreenTransform(value: Readonly<ColorScaleBias> | null): boolean {
  return (
    value !== null &&
    Math.abs(value.redScale) < 0.0001 &&
    Math.abs(value.greenScale - 1) < 0.0001 &&
    Math.abs(value.blueScale) < 0.0001 &&
    Math.abs(value.alphaScale - 1) < 0.0001 &&
    Math.abs(value.redBias) < 0.0001 &&
    Math.abs(value.greenBias) < 0.0001 &&
    Math.abs(value.blueBias) < 0.0001 &&
    Math.abs(value.alphaBias) < 0.0001
  );
}

const root = createSwfColorTransformMovieClip();
const children = getNodeChildren(root);
if (children.length !== 2 || children.some((child) => child.kind !== ShapeKind)) {
  throw new Error(`[swf-color-transform] expected two imported solid shapes, got ${children.length}`);
}
const rgbAdjustedSolid = children[1] as Shape;

declareAntialiasingPolicy('aa');

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: BACKGROUND,
  kinds: [ShapeKind],
  expectedImageDescription:
    'A 220x220 opaque black field with one flat 100x100 square at x 60-160 and y 60-160. The square is ' +
    'WHITE on Canvas and DOM, or GREEN on WebGL and WebGPU, and never red or blue. This two-colour bound ' +
    'records an UNDECIDED DESIGN: whether an imported SWF RGB CXFORM belongs in backend-neutral scene data ' +
    'or in the GPU solid-shape fold has not been ruled. One shared file covers all four backends so the ' +
    'disagreement remains visible; no captured colour may be blessed as the permanent contract until the ' +
    'architecture selects one representation. Nothing is drawn outside the square.',
});
backend = target.kind;
targetWidth = target.width;
if (target.kind === 'webgl') registerGlColorAdjustmentMaterialFeature(target.state);
if (target.kind === 'webgpu') registerWgpuColorAdjustmentMaterialFeature(target.state);
target.render(root);

const adjustedProxy = getRenderProxy2D(target.state, rgbAdjustedSolid);
if (adjustedProxy === undefined) {
  throw new Error(`[swf-color-transform/${backend}] adjusted solid has no render proxy`);
}
const realizesColorAdjustment = target.kind === 'webgl' || target.kind === 'webgpu';
if (realizesColorAdjustment) {
  if (!isGreenTransform(adjustedProxy.colorScaleBias)) {
    throw new Error(
      `[swf-color-transform/${backend}] imported RGB CXFORM did not reach the adjusted solid render proxy`,
    );
  }
} else if (adjustedProxy.colorScaleBias !== null) {
  throw new Error(`[swf-color-transform/${backend}] unsupported RGB CXFORM unexpectedly reached the render proxy`);
}
if (target.kind === 'webgpu') {
  const data = adjustedProxy.rendererData as unknown as WgpuShapeRendererData | null;
  wgpuMeshCount = data?.meshes?.length ?? 0;
  wgpuRasterSurfaceAllocated = data?.surface !== null && data?.surface !== undefined;
  if (wgpuMeshCount === 0 || wgpuRasterSurfaceAllocated) {
    throw new Error(
      `[swf-color-transform] imported adjusted solid did not use WebGPU mesh-only data ` +
        `(meshes ${wgpuMeshCount}, raster surface ${String(wgpuRasterSurfaceAllocated)})`,
    );
  }
}
logInfo({ backend, wgpuMeshCount, wgpuRasterSurfaceAllocated }, 'test');
