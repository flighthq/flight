import { unpackColorToLinear } from '@flighthq/color/contract';
import { getWgpuColorAdjustmentMaterialFeature, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import {
  createModifierRegistry,
  getModifierDefineKey,
  orderModifierStack,
  resolveModifier,
} from '@flighthq/shading/contract';
import type {
  AnimatedNormalModifier,
  DissolveModifier,
  EmissiveModifier,
  EnvReflectModifier,
  FogModifier,
  KeyedTable,
  LinearColor,
  Modifier,
  ModifierKind,
  ModifierRegistry,
  RimModifier,
  ShadedMaterial,
  Texture,
  ToonModifier,
  VertexDisplaceModifier,
  WgpuMeshPipeline,
  WgpuColorAdjustmentMaterialFeature,
  WgpuModifierCompileContext,
  WgpuModifierContribution,
  WgpuModifierSnippet,
  WgpuRenderState,
} from '@flighthq/types/contract';
import {
  AnimatedNormalModifierKind,
  DissolveModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  EnvReflectModifierKind,
  FogModifierKind,
  FogModifierMode,
  ModifierSlot,
  RegistryEntryState,
  RimModifierKind,
  ToonModifierKind,
  VertexDisplaceModifierKind,
  VertexDisplaceModifierSource,
} from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

import { getWgpuShadedBaseFlags } from './shadedWgpuMeshMaterialRenderer';
import { getWgpuClassicSharedSamplerModuleSourceForKey } from './wgpuClassicPrelude';
import {
  createWgpuMeshPipeline,
  ensureWgpuPbrSampleLayout,
  ensureWgpuScene3DPipeline,
  getWgpuMaterialSampler,
  resolveWgpuMaterialTextureView,
  spliceWgpuColorAdjustmentPrelude,
  stashWgpuUvTransform,
} from './wgpuMeshPipeline';
import { getWgpuScene3DRuntime, getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
import { getWgpuScene3DTime } from './wgpuScene3DTime';
import { registerWgpuModifierSnippet } from './wgpuShadedModifierSnippet';

interface ShadedModifierPlan {
  diffuse: string;
  effect: string;
  emissive: string;
  fragmentDeclarations: string;
  normal: string;
  orderedModifiers: readonly Modifier[];
  snippets: readonly (Readonly<WgpuModifierSnippet> | null)[];
  specular: string;
  textureCount: number;
  uniformFloatCount: number;
  vertex: string;
}

interface CachedShadedPlan {
  defineKey: string;
  modifiers: readonly Modifier[];
  plan: ShadedModifierPlan;
  registry: WgpuModifierSnippetSource;
}

type WgpuModifierSnippetSource = Readonly<ModifierRegistry> | Readonly<KeyedTable<WgpuModifierSnippet>>;

interface ShadedBinding {
  bindGroup: GPUBindGroup;
  buffer: GPUBuffer;
  data: Float32Array;
  entries: GPUBindGroupEntry[];
  layout: GPUBindGroupLayout;
  sampler: GPUSampler;
  textures: (Readonly<Texture> | null)[];
  views: GPUTextureView[];
}

// Writes the base surface plus every ordered modifier into one uniform allocation and binds the base
// maps plus modifier maps into the composed group(2). Bind groups are cached by material and rebuilt
// only when its compiled layout changes.
export function bindWgpuShadedSurface(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuMeshPipeline>,
  material: Readonly<ShadedMaterial>,
  diffuse: Readonly<LinearColor>,
  specular: Readonly<LinearColor>,
): GPUBindGroup {
  const registry = getModifierSnippetTable(state);
  const plan = getCachedModifierPlan(state, material, registry);
  const byteLength = 48 + plan.uniformFloatCount * 4;
  const stateBindings = getWgpuScene3DRuntime(state).shadedMaterialBindingCache as WeakMap<
    ShadedMaterial,
    ShadedBinding
  >;
  let binding = stateBindings.get(material);
  const sampler = getWgpuMaterialSampler(state, material.diffuseMap);
  if (
    binding === undefined ||
    binding.layout !== pipeline.materialBindGroupLayout ||
    binding.data.byteLength !== byteLength ||
    binding.textures.length !== plan.textureCount + 3
  ) {
    binding?.buffer.destroy();
    binding = createShadedBinding(state, pipeline.materialBindGroupLayout, byteLength, plan.textureCount + 3, sampler);
    stateBindings.set(material, binding);
  }

  binding.textures[0] = material.diffuseMap;
  binding.textures[1] = material.specularMap;
  binding.textures[2] = material.normalMap;
  let textureOffset = 3;
  for (let i = 0; i < plan.orderedModifiers.length; i++) {
    const snippet = plan.snippets[i];
    if (snippet?.textures !== undefined) {
      textureOffset = snippet.textures(plan.orderedModifiers[i], binding.textures, textureOffset);
    }
  }

  let resourcesChanged = binding.sampler !== sampler;
  binding.sampler = sampler;
  binding.entries[1].resource = sampler;
  for (let i = 0; i < binding.textures.length; i++) {
    // Resolving every current view is the invalidation seam: render-wgpu changes the view when the
    // Image identity or version changes, including ready->ready swaps.
    const view = resolveWgpuMaterialTextureView(state, binding.textures[i]);
    if (binding.views[i] !== view) {
      binding.views[i] = view;
      binding.entries[textureEntryIndex(i)].resource = view;
      resourcesChanged = true;
    }
  }
  if (resourcesChanged) {
    binding.bindGroup = state.device.createBindGroup({
      entries: binding.entries,
      layout: pipeline.materialBindGroupLayout,
    });
  }

  const data = binding.data;
  data.fill(0);
  data.set(diffuse, 0);
  data.set(specular, 4);
  data[8] = material.shininess;
  data[9] = material.alphaCutoff;
  data[10] = getWgpuScene3DTime(state);
  data[11] = material.normalScale;
  writeModifierUniforms(data, 12, plan);
  state.device.queue.writeBuffer(binding.buffer, 0, data.buffer, 0, byteLength);
  stashWgpuUvTransform(state, material.diffuseMap);
  return binding.bindGroup;
}

function createShadedBinding(
  state: WgpuRenderState,
  layout: GPUBindGroupLayout,
  byteLength: number,
  textureCount: number,
  sampler: GPUSampler,
): ShadedBinding {
  const buffer = state.device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const textures = new Array<Readonly<Texture> | null>(textureCount).fill(null);
  const placeholder = resolveWgpuMaterialTextureView(state, null);
  const views = new Array<GPUTextureView>(textureCount).fill(placeholder);
  const entries = new Array<GPUBindGroupEntry>(textureCount + 3);
  entries[0] = { binding: 0, resource: { buffer } };
  entries[1] = { binding: 1, resource: sampler };
  entries[5] = { binding: 5, resource: placeholder };
  for (let i = 0; i < textureCount; i++) {
    // Binding 5 belongs to the classic alpha map; modifier textures occupy the open range at 6+.
    entries[textureEntryIndex(i)] = {
      binding: i < 3 ? i + 2 : i + 3,
      resource: placeholder,
    };
  }
  return {
    bindGroup: state.device.createBindGroup({ entries, layout }),
    buffer,
    data: new Float32Array(byteLength / 4),
    entries,
    layout,
    sampler,
    textures,
    views,
  };
}

function textureEntryIndex(textureIndex: number): number {
  return textureIndex < 3 ? textureIndex + 2 : textureIndex + 3;
}

// Stable identity for one ShadedMaterial pipeline family. Base map/cull/mask flags precede the
// canonical ordered modifier signature; format and blend are added by the shared pipeline cache.
export function buildWgpuShadedCacheKey(
  material: Readonly<ShadedMaterial>,
  registry: WgpuModifierSnippetSource = EMPTY_MODIFIER_REGISTRY,
): string {
  const flags = getWgpuShadedBaseFlags(material);
  const base = `${flags.alphaMaskEnabled ? 'm' : '-'}${flags.doubleSided ? 'd' : '-'}${
    flags.hasDiffuseMap ? 'd' : '-'
  }${flags.hasSpecularMap ? 's' : '-'}${flags.hasNormalMap ? 'n' : '-'}`;
  return `shaded:${base}|${getWgpuModifierDefineKey(material.modifiers, registry)}`;
}

// Resolves the immutable shader/layout/pipeline permutation. The shared cache appends opaque/blend,
// so modifier composition combines naturally with §1's transparent variants.
export function ensureWgpuShadedPipeline(
  state: WgpuRenderState,
  material: Readonly<ShadedMaterial>,
  format: GPUTextureFormat,
): WgpuMeshPipeline {
  const registries = getWgpuRenderStateRuntime(state).registries;
  const registry = registries.modifierSnippets;
  const defineKey = buildWgpuShadedCacheKey(material, registry);
  const plan = getCachedModifierPlan(state, material, registry, defineKey);
  const colorAdjusted = getWgpuScene3DRuntime(state).activeColorAdjustmentRun;
  const colorMatrix = getWgpuScene3DRuntime(state).activeColorMatrixRun;
  const key = `${defineKey}|registry:${registries.modifierSnippetRevision}|${format}|${
    colorMatrix ? 'color-matrix' : colorAdjusted ? 'color-adjusted' : 'base'
  }`;
  return ensureWgpuScene3DPipeline(state, key, (blended, skinned) => {
    const entries: GPUBindGroupLayoutEntry[] = [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      ...[2, 3, 4].map(
        (binding): GPUBindGroupLayoutEntry => ({
          binding,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        }),
      ),
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
    ];
    for (let i = 0; i < plan.textureCount; i++) {
      entries.push({
        binding: i + 6,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      });
    }
    const materialBindGroupLayout = state.device.createBindGroupLayout({ entries });
    const module = state.device.createShaderModule({
      code: assembleWgpuShadedModuleSource(
        material,
        plan,
        skinned,
        getWgpuSkinningAdapter(state),
        colorAdjusted || colorMatrix ? getWgpuColorAdjustmentMaterialFeature(state) : null,
        colorMatrix,
      ),
    });
    return createWgpuMeshPipeline(state, {
      blended,
      doubleSided: getWgpuShadedBaseFlags(material).doubleSided,
      format,
      materialBindGroupLayout,
      module,
      pbrSampleBindGroupLayout: ensureWgpuPbrSampleLayout(state),
      skinned,
    });
  });
}

// Creates the WGSL module for a ShadedMaterial variant. The lean base is the existing Blinn-Phong
// WGSL assembly; modifier declarations and slot contributions are spliced at stable semantic hooks.
// This keeps shared Frame/Draw/light/shadow behavior byte-for-byte aligned with classic WebGPU.
export function getWgpuShadedModuleSource(
  material: Readonly<ShadedMaterial>,
  registry: WgpuModifierSnippetSource = EMPTY_MODIFIER_REGISTRY,
  skinned = false,
  skinning: Readonly<WgpuSkinningAdapter> | null = null,
  colorAdjustmentFeature: Readonly<WgpuColorAdjustmentMaterialFeature> | null = null,
  colorMatrix = false,
): string {
  const plan = buildModifierPlan(material.modifiers, registry);
  return assembleWgpuShadedModuleSource(material, plan, skinned, skinning, colorAdjustmentFeature, colorMatrix);
}

function assembleWgpuShadedModuleSource(
  material: Readonly<ShadedMaterial>,
  plan: Readonly<ShadedModifierPlan>,
  skinned: boolean,
  skinning: Readonly<WgpuSkinningAdapter> | null,
  colorAdjustmentFeature: Readonly<WgpuColorAdjustmentMaterialFeature> | null,
  colorMatrix: boolean,
): string {
  const flags = getWgpuShadedBaseFlags(material);
  const defineKey = {
    alphaMaskEnabled: flags.alphaMaskEnabled,
    doubleSided: flags.doubleSided,
    hasDiffuseMap: flags.hasDiffuseMap,
    hasAlphaMap: false,
    hasNormalMap: flags.hasNormalMap,
    hasSpecularMap: flags.hasSpecularMap,
    lightingModel: 'blinnphong',
  } as const;
  let source = getWgpuClassicSharedSamplerModuleSourceForKey(defineKey, skinned, skinning);

  source = source.replace(
    '  let world = draw.world * localPosition;',
    `  let vertexUv = uv;
${indent(plan.vertex, 2)}
  let world = draw.world * localPosition;`,
  );
  const modifierField =
    plan.uniformFloatCount === 0 ? '' : `\n  modifierData : array<vec4f, ${plan.uniformFloatCount / 4}>,`;
  source = source.replace(
    'params : vec4f,    // x = shininess, y = alphaCutoff',
    `params : vec4f,    // x = shininess, y = alphaCutoff, z = time, w = normalScale${modifierField}`,
  );

  let textureDeclarations = '';
  for (let i = 0; i < plan.textureCount; i++) {
    const binding = i + 6;
    textureDeclarations += `@group(2) @binding(${binding}) var modifierTexture${binding} : texture_2d<f32>;\n`;
  }
  source = source.replace(
    '@group(2) @binding(4) var normalTexture : texture_2d<f32>;',
    `@group(2) @binding(4) var normalTexture : texture_2d<f32>;\n${textureDeclarations}\n${plan.fragmentDeclarations}`,
  );

  source = source.replace(
    `  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    let tangent = normalize(in.worldTangent.xyz);
    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;
    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }`,
    `  let tangent = normalize(in.worldTangent.xyz);
  let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;
  let tbn = mat3x3f(tangent, bitangent, geometricNormal);
  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - vec3f(1.0);
    tangentNormal.x = tangentNormal.x * material.params.w;
    tangentNormal.y = tangentNormal.y * material.params.w;
    normal = normalize(tbn * tangentNormal);
  }
${indent(plan.normal, 2)}`,
  );
  source = source.replace(
    '  if (ALPHA_MASK && diffuse.a < material.params.y) {',
    `${indent(plan.diffuse, 2)}
  if (ALPHA_MASK && diffuse.a < material.params.y) {`,
  );
  source = source.replace(
    '  var radiance = vec3f(0.0);',
    `${indent(plan.specular, 2)}
  var radiance = vec3f(0.0);`,
  );
  source = source.replace(
    '  var radiance = vec3f(0.0);',
    `  let shadedViewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
  var emissive = vec3f(0.0);
${indent(plan.emissive, 2)}
  var radiance = vec3f(0.0);`,
  );
  source = source.replace(
    '      let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);',
    '      let viewDir = shadedViewDir;',
  );
  source = source.replace(
    '  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));',
    `  radiance = radiance + emissive;
${indent(plan.effect, 2)}
  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));`,
  );
  source = source.replace(
    '@group(3) @binding(2) var shadowSampler : sampler_comparison;',
    `@group(3) @binding(2) var shadowSampler : sampler_comparison;

struct Ibl {
  params : vec4f, // x = enabled, y = intensity, z = maxMip
};
@group(3) @binding(3) var<uniform> ibl : Ibl;
@group(3) @binding(4) var iblIrradiance : texture_cube<f32>;
@group(3) @binding(5) var iblPrefiltered : texture_cube<f32>;
@group(3) @binding(6) var iblBrdf : texture_2d<f32>;
@group(3) @binding(7) var iblSampler : sampler;`,
  );
  if (colorAdjustmentFeature !== null) {
    source = spliceWgpuColorAdjustmentPrelude(source, colorAdjustmentFeature, colorMatrix).replace(
      '  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(diffuse.a, in.objectAlpha, draw.params.y)));',
      `  var flightColor = vec4f(radiance, diffuse.a);
  flightColor = ${
    colorMatrix
      ? 'applyFlightColorMatrix(flightColor, draw.flightColorMatrix0, draw.flightColorMatrix1, draw.flightColorMatrix2, draw.flightColorMatrix3, draw.flightColorMatrixOffset)'
      : 'applyFlightColorAdjustment(flightColor, draw.flightColorScale, draw.flightColorBias)'
  };
  flightColor.a = flightMeshCoverage(flightColor.a, in.objectAlpha, draw.params.y);
  return flightPremultipliedOutput(flightColor);`,
    );
  }
  return source;
}

function buildModifierPlan(modifiers: readonly Modifier[], registry: WgpuModifierSnippetSource): ShadedModifierPlan {
  const ordered = orderModifierStack(modifiers);
  const snippets: (Readonly<WgpuModifierSnippet> | null)[] = new Array(ordered.length);
  const declarations = new Set<string>();
  let diffuse = '';
  let normal = '';
  let specular = '';
  let emissive = '';
  let effect = '';
  let vertex = '';
  let textureCount = 0;
  for (let index = 0; index < ordered.length; index++) {
    const modifier = ordered[index];
    const snippet = resolveWgpuModifierSnippetSource(registry, modifier.kind);
    snippets[index] = snippet;
    if (snippet === null) continue;
    const base = index * MODIFIER_FLOATS;
    const context: WgpuModifierCompileContext = {
      acquireTexture: () => 6 + textureCount++,
      uniformBase: base,
    };
    const contribution = snippet.contribution(modifier, index, context);
    if (contribution.declarations !== undefined) declarations.add(contribution.declarations.trim());
    const source = delimitContribution(contribution.source);
    if (snippet.slot === ModifierSlot.Normal) normal += source;
    else if (snippet.slot === ModifierSlot.Diffuse) diffuse += source;
    else if (snippet.slot === ModifierSlot.Specular) specular += source;
    else if (snippet.slot === ModifierSlot.Emissive) emissive += source;
    else if (snippet.slot === ModifierSlot.Effect) effect += source;
    else if (snippet.slot === ModifierSlot.Vertex) vertex += source;
  }
  return {
    diffuse,
    effect,
    emissive,
    fragmentDeclarations: declarations.size === 0 ? '' : `${Array.from(declarations).join('\n')}\n`,
    normal,
    orderedModifiers: ordered,
    snippets,
    specular,
    textureCount,
    uniformFloatCount: ordered.length * MODIFIER_FLOATS,
    vertex,
  };
}

function delimitContribution(source: string): string {
  if (source.length === 0) return '';
  return source.endsWith('\n') ? source : `${source}\n`;
}

function writeModifierUniforms(out: Float32Array, offset: number, plan: Readonly<ShadedModifierPlan>): void {
  for (let index = 0; index < plan.orderedModifiers.length; index++) {
    plan.snippets[index]?.bind?.(plan.orderedModifiers[index], out, offset + index * MODIFIER_FLOATS);
  }
}

function getCachedModifierPlan(
  state: WgpuRenderState,
  material: Readonly<ShadedMaterial>,
  registry: WgpuModifierSnippetSource,
  defineKey?: string,
): ShadedModifierPlan {
  const plans = getWgpuScene3DRuntime(state).shadedMaterialPlanCache as WeakMap<ShadedMaterial, CachedShadedPlan>;
  const cached = plans.get(material);
  if (
    cached !== undefined &&
    cached.modifiers === material.modifiers &&
    cached.registry === registry &&
    (defineKey === undefined || cached.defineKey === defineKey) &&
    hasCurrentSnippets(cached.plan, registry)
  ) {
    return cached.plan;
  }
  const plan = buildModifierPlan(material.modifiers, registry);
  plans.set(material, {
    defineKey: defineKey ?? buildWgpuShadedCacheKey(material, registry),
    modifiers: material.modifiers,
    plan,
    registry,
  });
  return plan;
}

function hasCurrentSnippets(plan: Readonly<ShadedModifierPlan>, registry: WgpuModifierSnippetSource): boolean {
  for (let i = 0; i < plan.orderedModifiers.length; i++) {
    if (resolveWgpuModifierSnippetSource(registry, plan.orderedModifiers[i].kind) !== plan.snippets[i]) return false;
  }
  return true;
}

function copyColorRgb(out: Float32Array, offset: number): void {
  out[offset] = _color[0];
  out[offset + 1] = _color[1];
  out[offset + 2] = _color[2];
}

export const animatedNormalWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<AnimatedNormalModifier>;
    out[base] = value.scroll.x;
    out[base + 1] = value.scroll.y;
    out[base + 2] = value.strength ?? 1;
    out[base + 4] = value.secondaryScroll?.x ?? 0;
    out[base + 5] = value.secondaryScroll?.y ?? 0;
  },
  contribution(modifier, _index, context): WgpuModifierContribution {
    const value = modifier as Readonly<AnimatedNormalModifier>;
    if (value.map === null) return { source: '' };
    const base = context.uniformBase / 4;
    const primary = context.acquireTexture(value.map);
    const secondary =
      value.secondaryMap === undefined
        ? ''
        : ` + textureSample(modifierTexture${context.acquireTexture(value.secondaryMap)}, materialSampler, in.uv + material.modifierData[${base + 1}].xy * material.params.z).xyz * 2.0 - vec3f(1.0)`;
    return {
      source: `{
  var animatedNormal = textureSample(modifierTexture${primary}, materialSampler, in.uv + material.modifierData[${base}].xy * material.params.z).xyz * 2.0 - vec3f(1.0)${secondary};
  animatedNormal.x = animatedNormal.x * material.modifierData[${base}].z;
  animatedNormal.y = animatedNormal.y * material.modifierData[${base}].z;
  normal = normalize(tbn * animatedNormal);
}
`,
    };
  },
  getDefineSignature(modifier): string {
    const value = modifier as Readonly<AnimatedNormalModifier>;
    return value.map === null ? '0' : value.secondaryMap === undefined ? '1' : '2';
  },
  kind: AnimatedNormalModifierKind,
  slot: ModifierSlot.Normal,
  textures(modifier, out, offset): number {
    const value = modifier as Readonly<AnimatedNormalModifier>;
    if (value.map === null) return offset;
    out[offset++] = value.map;
    if (value.secondaryMap !== undefined) out[offset++] = value.secondaryMap;
    return offset;
  },
};
export const dissolveWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<DissolveModifier>;
    out[base] = value.threshold;
    out[base + 1] = value.edgeWidth ?? 0.05;
    out[base + 2] = value.scale ?? 8;
    unpackColorToLinear(_color, value.edgeColor);
    copyColorRgb(out, base + 4);
  },
  contribution(modifier, _index, context): WgpuModifierContribution {
    const value = modifier as Readonly<DissolveModifier>;
    const base = context.uniformBase / 4;
    const procedural = value.map === undefined;
    const noise = procedural
      ? `shadedValueNoise(in.uv * material.modifierData[${base}].z)`
      : `textureSample(modifierTexture${context.acquireTexture(value.map!)}, materialSampler, in.uv).r`;
    return {
      declarations: procedural ? VALUE_NOISE_WGSL : undefined,
      source: `{
  let dissolveNoise = ${noise};
  if (dissolveNoise < material.modifierData[${base}].x) { discard; }
  let dissolveEdge = 1.0 - smoothstep(material.modifierData[${base}].x, material.modifierData[${base}].x + max(material.modifierData[${base}].y, 0.0001), dissolveNoise);
  radiance = mix(radiance, material.modifierData[${base + 1}].rgb, dissolveEdge);
}
`,
    };
  },
  getDefineSignature(modifier): string {
    return (modifier as Readonly<DissolveModifier>).map === undefined ? 'p' : 'm';
  },
  kind: DissolveModifierKind,
  slot: ModifierSlot.Effect,
  textures(modifier, out, offset): number {
    const map = (modifier as Readonly<DissolveModifier>).map;
    if (map !== undefined) out[offset++] = map;
    return offset;
  },
};
export const emissiveWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<EmissiveModifier>;
    unpackColorToLinear(_color, value.color);
    copyColorRgb(out, base);
    out[base + 3] = value.strength;
    out[base + 4] = value.facing === EmissiveModifierFacing.AwayFromLight ? -1 : 1;
    out[base + 5] = value.facingSoftness ?? 0;
  },
  contribution(modifier, _index, context): WgpuModifierContribution {
    const value = modifier as Readonly<EmissiveModifier>;
    const base = context.uniformBase / 4;
    const mask =
      value.mask === undefined
        ? ''
        : ` * textureSample(modifierTexture${context.acquireTexture(value.mask)}, materialSampler, in.uv).rgb`;
    const gated =
      value.facing === undefined || value.facing === EmissiveModifierFacing.Ignore
        ? ''
        : `
  let emissiveLightDir = select(vec3f(0.0, 0.0, 1.0), normalize(-frame.lightDirection.xyz), frame.lightDirection.w > 0.5);
  let emissiveFacing = dot(normal, emissiveLightDir) * material.modifierData[${base + 1}].x;
  let emissiveSoft = max(material.modifierData[${base + 1}].y, 0.0001);
  emissiveTerm = emissiveTerm * smoothstep(-emissiveSoft, emissiveSoft, emissiveFacing);`;
    return {
      source: `{
  var emissiveTerm = material.modifierData[${base}].rgb * material.modifierData[${base}].w${mask};${gated}
  emissive = emissive + emissiveTerm;
}
`,
    };
  },
  getDefineSignature(modifier): string {
    const value = modifier as Readonly<EmissiveModifier>;
    return `${value.mask === undefined ? '' : 'm'}${
      value.facing === undefined || value.facing === EmissiveModifierFacing.Ignore ? '' : 'g'
    }`;
  },
  kind: EmissiveModifierKind,
  slot: ModifierSlot.Emissive,
  textures(modifier, out, offset): number {
    const mask = (modifier as Readonly<EmissiveModifier>).mask;
    if (mask !== undefined) out[offset++] = mask;
    return offset;
  },
};
export const envReflectWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<EnvReflectModifier>;
    unpackColorToLinear(_color, value.tint);
    copyColorRgb(out, base);
    out[base + 3] = value.intensity ?? 1;
    out[base + 4] = value.fresnelBias ?? 0.04;
    out[base + 5] = value.roughness ?? 0;
  },
  contribution(_modifier, _index, context): WgpuModifierContribution {
    const base = context.uniformBase / 4;
    return {
      source: `{
  let envDirection = reflect(-shadedViewDir, normal);
  let envMip = clamp(material.modifierData[${base + 1}].y, 0.0, 1.0) * max(ibl.params.z, 0.0);
  let envSample = select(material.modifierData[${base}].rgb, textureSampleLevel(iblPrefiltered, iblSampler, envDirection, envMip).rgb, ibl.params.x > 0.5);
  let envFresnel = material.modifierData[${base + 1}].x + (1.0 - material.modifierData[${base + 1}].x) * pow(1.0 - max(dot(normal, shadedViewDir), 0.0), 5.0);
  radiance = radiance + envSample * material.modifierData[${base}].rgb * (material.modifierData[${base}].w * envFresnel);
}
`,
    };
  },
  kind: EnvReflectModifierKind,
  slot: ModifierSlot.Effect,
};
export const fogWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<FogModifier>;
    unpackColorToLinear(_color, value.color);
    copyColorRgb(out, base);
    out[base + 4] = value.density ?? 1;
    out[base + 5] = value.near ?? 0;
    out[base + 6] = value.far ?? 1;
  },
  contribution(modifier, _index, context): WgpuModifierContribution {
    const value = modifier as Readonly<FogModifier>;
    const base = context.uniformBase / 4;
    const distance = `length(frame.cameraPosition.xyz - in.worldPosition)`;
    const factor =
      value.mode === FogModifierMode.Exponential
        ? `1.0 - exp(-material.modifierData[${base + 1}].x * ${distance})`
        : value.mode === FogModifierMode.Exponential2
          ? `1.0 - exp(-pow(material.modifierData[${base + 1}].x * ${distance}, 2.0))`
          : `clamp((${distance} - material.modifierData[${base + 1}].y) / max(material.modifierData[${base + 1}].z - material.modifierData[${base + 1}].y, 0.0001), 0.0, 1.0)`;
    return {
      source: `radiance = mix(radiance, material.modifierData[${base}].rgb, clamp(${factor}, 0.0, 1.0));\n`,
    };
  },
  getDefineSignature(modifier): string {
    return (modifier as Readonly<FogModifier>).mode ?? FogModifierMode.Linear;
  },
  kind: FogModifierKind,
  slot: ModifierSlot.Effect,
};
export const rimWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<RimModifier>;
    unpackColorToLinear(_color, value.color);
    copyColorRgb(out, base);
    out[base + 3] = value.power ?? 3;
    out[base + 4] = value.intensity ?? 1;
    out[base + 5] = value.bias ?? 0;
  },
  contribution(_modifier, _index, context): WgpuModifierContribution {
    const base = context.uniformBase / 4;
    return {
      source: `{
  let rimFactor = clamp(material.modifierData[${base + 1}].y + material.modifierData[${base + 1}].x * pow(1.0 - max(dot(normal, shadedViewDir), 0.0), max(material.modifierData[${base}].w, 0.0001)), 0.0, 1.0);
  radiance = radiance + material.modifierData[${base}].rgb * rimFactor;
}
`,
    };
  },
  kind: RimModifierKind,
  slot: ModifierSlot.Effect,
};
export const toonWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<ToonModifier>;
    out[base] = Math.max(value.steps, 2);
    out[base + 1] = value.smoothness ?? 0;
  },
  contribution(_modifier, _index, context): WgpuModifierContribution {
    const base = context.uniformBase / 4;
    return {
      source: `{
  let toonLum = dot(radiance, vec3f(0.2126, 0.7152, 0.0722));
  let toonSteps = max(material.modifierData[${base}].x, 2.0);
  let toonScaled = toonLum * toonSteps;
  let toonBand = floor(toonScaled);
  let toonSoft = max(material.modifierData[${base}].y, 0.0001);
  let toonQuant = (toonBand + smoothstep(0.5 - toonSoft, 0.5 + toonSoft, toonScaled - toonBand)) / toonSteps;
  radiance = radiance * select(1.0, toonQuant / toonLum, toonLum > 0.0001);
}
`,
    };
  },
  kind: ToonModifierKind,
  slot: ModifierSlot.Effect,
};
export const vertexDisplaceWgpuModifierSnippet: WgpuModifierSnippet = {
  bind(modifier, out, base): void {
    const value = modifier as Readonly<VertexDisplaceModifier>;
    out[base] = value.amplitude;
    out[base + 1] = value.frequency ?? 1;
    out[base + 2] = value.speed ?? 1;
    out[base + 4] = value.axis?.x ?? 0;
    out[base + 5] = value.axis?.y ?? 0;
    out[base + 6] = value.axis?.z ?? 0;
    out[base + 8] = value.direction?.x ?? 1;
    out[base + 9] = value.direction?.y ?? 0;
    out[base + 10] = value.direction?.z ?? 0;
  },
  contribution(modifier, _index, context): WgpuModifierContribution {
    const value = modifier as Readonly<VertexDisplaceModifier>;
    const base = context.uniformBase / 4;
    const axis =
      value.axis === undefined ? 'normalize(localNormal)' : `normalize(material.modifierData[${base + 1}].xyz)`;
    const amount =
      value.source === VertexDisplaceModifierSource.HeightMap && value.map !== undefined
        ? `textureSampleLevel(modifierTexture${context.acquireTexture(value.map)}, materialSampler, vertexUv, 0.0).r * material.modifierData[${base}].x`
        : `sin(dot(localPosition.xyz, normalize(material.modifierData[${base + 2}].xyz)) * material.modifierData[${base}].y + material.params.z * material.modifierData[${base}].z) * material.modifierData[${base}].x`;
    return { source: `localPosition = vec4f(localPosition.xyz + ${axis} * (${amount}), 1.0);\n` };
  },
  getDefineSignature(modifier): string {
    const value = modifier as Readonly<VertexDisplaceModifier>;
    return `${value.source}${value.axis === undefined ? '' : 'a'}${value.map === undefined ? '' : 'm'}`;
  },
  kind: VertexDisplaceModifierKind,
  slot: ModifierSlot.Vertex,
  textures(modifier, out, offset): number {
    const value = modifier as Readonly<VertexDisplaceModifier>;
    if (value.source === VertexDisplaceModifierSource.HeightMap && value.map !== undefined) out[offset++] = value.map;
    return offset;
  },
};

export function registerBuiltInWgpuModifierSnippets(state: WgpuRenderState): void {
  registerWgpuModifierSnippet(state, animatedNormalWgpuModifierSnippet);
  registerWgpuModifierSnippet(state, dissolveWgpuModifierSnippet);
  registerWgpuModifierSnippet(state, emissiveWgpuModifierSnippet);
  registerWgpuModifierSnippet(state, envReflectWgpuModifierSnippet);
  registerWgpuModifierSnippet(state, fogWgpuModifierSnippet);
  registerWgpuModifierSnippet(state, rimWgpuModifierSnippet);
  registerWgpuModifierSnippet(state, toonWgpuModifierSnippet);
  registerWgpuModifierSnippet(state, vertexDisplaceWgpuModifierSnippet);
}

function getModifierSnippetTable(state: WgpuRenderState): Readonly<KeyedTable<WgpuModifierSnippet>> {
  return getWgpuRenderStateRuntime(state).registries.modifierSnippets;
}

function indent(source: string, spaces: number): string {
  if (source.length === 0) return '';
  const prefix = ' '.repeat(spaces);
  return source
    .split('\n')
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n');
}

const VALUE_NOISE_WGSL = /* wgsl */ `
fn shadedHashNoise(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn shadedValueNoise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  return mix(mix(shadedHashNoise(i), shadedHashNoise(i + vec2f(1.0, 0.0)), u.x),
    mix(shadedHashNoise(i + vec2f(0.0, 1.0)), shadedHashNoise(i + vec2f(1.0, 1.0)), u.x), u.y);
}
`;

const MODIFIER_FLOATS = 12;
const _color: LinearColor = [0, 0, 0, 0];
const EMPTY_MODIFIER_REGISTRY: ModifierRegistry = createModifierRegistry();

function getWgpuModifierDefineKey(stack: readonly Modifier[], registry: WgpuModifierSnippetSource): string {
  if (!isWgpuModifierSnippetTable(registry)) return getModifierDefineKey(stack, registry);
  const ordered = orderModifierStack(stack);
  let key = '';
  for (const modifier of ordered) {
    const snippet = resolveWgpuModifierSnippetSource(registry, modifier.kind);
    const signature = snippet?.getDefineSignature?.(modifier) ?? '';
    const token = signature.length > 0 ? `${modifier.kind}:${signature}` : modifier.kind;
    key = key.length > 0 ? `${key}+${token}` : token;
  }
  return key;
}

function resolveWgpuModifierSnippetSource(
  registry: WgpuModifierSnippetSource,
  kind: ModifierKind,
): WgpuModifierSnippet | null {
  if (!isWgpuModifierSnippetTable(registry)) return resolveModifier(registry, kind) as WgpuModifierSnippet | null;
  const entry = registry.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

function isWgpuModifierSnippetTable(
  registry: WgpuModifierSnippetSource,
): registry is Readonly<KeyedTable<WgpuModifierSnippet>> {
  return 'shape' in registry;
}
