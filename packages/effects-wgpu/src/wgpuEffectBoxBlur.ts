import { computeBoxBlurPassRadius } from '@flighthq/effects';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';
import type { WgpuEffectPipeline } from '@flighthq/types';

import { createWgpuEffectPipeline, drawWgpuEffectPass } from './wgpuEffectPass';

// Uniforms layout:
//   offset  0: texelSize (vec2f)
//   offset  8: direction (vec2f)
//   offset 16: edgeColor (vec4f)
//   offset 32: radius (f32)
//   offset 36: useEdgeColor (f32)
//   offset 40-47: padding
const BOX_BLUR_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize : vec2f,
  direction : vec2f,
  edgeColor : vec4f,
  radius : f32,
  useEdgeColor : f32,
  _pad0 : f32, _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sampleBlur(uv : vec2f) -> vec4f {
  if (uni.useEdgeColor > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) {
    return uni.edgeColor;
  }
  return textureSampleLevel(tex, smp, uv, 0.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = i32(uni.radius);
  if (r == 0) { return sampleBlur(uv); }
  var sum = vec4f(0.0);
  let count = f32(2 * r + 1);
  for (var i = -r; i <= r; i++) {
    sum += sampleBlur(uv + f32(i) * uni.texelSize * uni.direction);
  }
  return sum / count;
}`;

type BoxBlurEdgeColor = readonly [number, number, number, number];

/**
 * Applies a separable box blur to `source`, writing to `dest`. `blurX`/`blurY` are
 * the target Gaussian standard deviations; `passes` is the number of box passes per
 * axis (more passes converge on a Gaussian — see `computeBoxBlurPassRadius`). A box
 * blur is cheap and right for soft spreads. `temp` is a caller-provided ping-pong
 * scratch target distinct from both `source` and `dest`.
 */
export function applyWgpuEffectBoxBlur(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  temp: WgpuRenderTarget,
  options: Readonly<{
    blurX?: number;
    blurY?: number;
    passes?: number;
    edgeColor?: readonly [number, number, number, number];
  }>,
): void {
  const passes = Math.max(1, Math.round(options.passes ?? 1));
  const blurX = options.blurX ?? 4;
  const blurY = options.blurY ?? 4;
  const edgeColor = options.edgeColor;

  let read: WgpuRenderTarget = source;
  let write: WgpuRenderTarget = temp;

  for (let pass = 0; pass < passes; pass++) {
    const radiusX = computeBoxBlurPassRadius(blurX, passes, pass);
    if (radiusX > 0) {
      applyBoxBlurPass(state, read, write, radiusX, 1, 0, edgeColor);
      read = write;
      write = write === temp ? dest : temp;
    }
    const radiusY = computeBoxBlurPassRadius(blurY, passes, pass);
    if (radiusY > 0) {
      applyBoxBlurPass(state, read, write, radiusY, 0, 1, edgeColor);
      read = write;
      write = write === temp ? dest : temp;
    }
  }

  if (read !== dest) {
    applyBoxBlurPass(state, read, dest, 0, 0, 0, undefined);
  }
}

function applyBoxBlurPass(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  radius: number,
  dirX: number,
  dirY: number,
  edgeColor: BoxBlurEdgeColor | undefined,
): void {
  const pipeline = getBoxBlurPipeline(state);
  drawWgpuEffectPass(state, source, dest, pipeline, (f32) => {
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    f32[2] = dirX;
    f32[3] = dirY;
    if (edgeColor === undefined) {
      f32[4] = 0;
      f32[5] = 0;
      f32[6] = 0;
      f32[7] = 0;
      f32[9] = 0;
    } else {
      f32[4] = edgeColor[0];
      f32[5] = edgeColor[1];
      f32[6] = edgeColor[2];
      f32[7] = edgeColor[3];
      f32[9] = 1;
    }
    f32[8] = radius;
  });
}

function getBoxBlurPipeline(state: WgpuRenderState): WgpuEffectPipeline {
  let p = boxBlurPipelines.get(state);
  if (p === undefined) {
    p = createWgpuEffectPipeline(state, BOX_BLUR_WGSL, 'replace');
    boxBlurPipelines.set(state, p);
  }
  return p;
}

const boxBlurPipelines = new WeakMap<WgpuRenderState, WgpuEffectPipeline>();
