import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getWgpuSampler, resolveWgpuTexture } from '@flighthq/render-wgpu/contract';
import type {
  BitmapDisplacementEffect,
  RenderEffect,
  Sampler,
  TextureFilter,
  WgpuEffectPipeline,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types/contract';
import { ImageChannel } from '@flighthq/types/contract';

import { drawWgpuEffectPass, EFFECT_VERTEX_WGSL, getWgpuEffectPassState } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';

export function applyBitmapDisplacementEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<BitmapDisplacementEffect>,
): void {
  const map = effect.map;
  const mapEntry = map === null ? null : resolveWgpuTexture(state, map, false, source.colorSpace);
  if (mapEntry === null) {
    drawWgpuEffectPass(
      state,
      source as WgpuRenderTarget,
      dest as WgpuRenderTarget,
      getWgpuEffectPipeline(
        state,
        'spatial.bitmapDisplacement.passthrough',
        BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_WGSL,
        'replace',
      ),
      NO_UNIFORMS,
    );
    return;
  }
  const resolvedMap = map!;

  const fs = getWgpuEffectPassState(state);
  const sourceBindGroup = state.device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: source.view },
      { binding: 1, resource: fs.sampler },
    ],
  });
  const mapBindGroup = state.device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: mapEntry.view },
      { binding: 1, resource: mapEntry.sampler ?? getBitmapDisplacementMapSampler(state, resolvedMap.sampler) },
    ],
  });

  const slotOffset = fs.acquireSlot();
  fs.writeSlot(slotOffset, (f32, i32) => {
    f32[0] = effect.scaleX ?? 0;
    f32[1] = effect.scaleY ?? 0;
    f32[2] = source.width;
    f32[3] = source.height;
    i32[4] = effect.componentX ?? ImageChannel.Red;
    i32[5] = effect.componentY ?? ImageChannel.Green;
    i32[6] = effect.edgeMode === 'clamp' ? 0 : 1;
  });

  const pass = fs.beginPass(dest as WgpuRenderTarget, 'load');
  pass.setPipeline(getBitmapDisplacementPipeline(state, dest.format).pipeline);
  pass.setBindGroup(0, fs.uniformBG, [slotOffset]);
  pass.setBindGroup(1, sourceBindGroup);
  pass.setBindGroup(2, mapBindGroup);
  pass.draw(6);
  pass.end();
}

export const defaultWgpuBitmapDisplacementEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyBitmapDisplacementEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as BitmapDisplacementEffect);
};

export function isWgpuBitmapDisplacementEffectResolvable(
  state: WgpuRenderState,
  effect: Readonly<RenderEffect>,
): boolean {
  const map = (effect as Readonly<BitmapDisplacementEffect>).map;
  return (
    map !== null && resolveWgpuTexture(state, map, false, map.colorSpace === 'linear' ? 'linear' : 'srgb') !== null
  );
}

export function registerWgpuBitmapDisplacementEffect(state: WgpuRenderState): void {
  registerWgpuRenderEffect(
    state,
    'BitmapDisplacementEffect',
    defaultWgpuBitmapDisplacementEffectRunner,
    isWgpuBitmapDisplacementEffectResolvable,
  );
}

function getBitmapDisplacementMapSampler(state: WgpuRenderState, sampler: Readonly<Sampler>): GPUSampler {
  const mipmapFilter = getMipmapFilter(sampler.minFilter, sampler.mipmaps);
  return getWgpuSampler(
    state,
    getFilter(sampler.minFilter),
    getFilter(sampler.magFilter),
    sampler.wrapU,
    sampler.wrapV,
    mipmapFilter,
    sampler.anisotropy,
  );
}

function getFilter(filter: TextureFilter): GPUFilterMode {
  return filter.startsWith('nearest') ? 'nearest' : 'linear';
}

function getMipmapFilter(filter: TextureFilter, mipmaps: boolean): GPUMipmapFilterMode | undefined {
  if (!mipmaps || !filter.includes('mipmap')) return undefined;
  return filter.endsWith('nearest') ? 'nearest' : 'linear';
}

function getBitmapDisplacementPipeline(state: WgpuRenderState, format: GPUTextureFormat): WgpuEffectPipeline {
  let byFormat = _pipelines.get(state);
  if (byFormat === undefined) {
    byFormat = new Map();
    _pipelines.set(state, byFormat);
  }
  let pipeline = byFormat.get(format);
  if (pipeline !== undefined) return pipeline;

  const fs = getWgpuEffectPassState(state);
  const shaderModule = state.device.createShaderModule({
    code: EFFECT_VERTEX_WGSL + BITMAP_DISPLACEMENT_FRAGMENT_WGSL,
  });
  const layout = state.device.createPipelineLayout({
    bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout, fs.textureBGLayout],
  });
  const _entity = allocateEntity<WgpuEffectPipeline>();
  _entity.blendMode = 'replace';
  _entity.pipeline = state.device.createRenderPipeline({
    layout,
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format, blend: REPLACE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  pipeline = finishEntity(_entity);
  byFormat.set(format, pipeline);
  return pipeline;
}

export const BITMAP_DISPLACEMENT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  scale : vec2f,
  resolution : vec2f,
  componentX : i32,
  componentY : i32,
  edgeMode : i32,
  _pad0 : i32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var sourceTexture : texture_2d<f32>;
@group(1) @binding(1) var sourceSampler : sampler;
@group(2) @binding(0) var mapTexture : texture_2d<f32>;
@group(2) @binding(1) var mapSampler : sampler;

fn sampleChannel(value : vec4f, component : i32) -> f32 {
  if (component == 0) { return value.r; }
  if (component == 1) { return value.g; }
  if (component == 2) { return value.b; }
  return value.a;
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let mapSample = textureSampleLevel(mapTexture, mapSampler, uv, 0.0);
  let mapped = vec2f(
    sampleChannel(mapSample, uni.componentX),
    sampleChannel(mapSample, uni.componentY),
  );
  let displacementPixels = (mapped - vec2f(0.5)) * uni.scale;
  let displacement = displacementPixels / uni.resolution;
  let displaced = vec2f(uv.x + displacement.x, uv.y + displacement.y);
  let sourceUv = select(
    clamp(displaced, vec2f(0.0), vec2f(1.0)),
    fract(displaced),
    uni.edgeMode == 1,
  );
  return textureSampleLevel(sourceTexture, sourceSampler, sourceUv, 0.0);
}`;

const BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { _pad0 : f32, _pad1 : f32, _pad2 : f32, _pad3 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var sourceTexture : texture_2d<f32>;
@group(1) @binding(1) var sourceSampler : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0);
}`;

const NO_UNIFORMS = () => {};

const REPLACE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
};

const _pipelines = new WeakMap<WgpuRenderState, Map<GPUTextureFormat, WgpuEffectPipeline>>();
