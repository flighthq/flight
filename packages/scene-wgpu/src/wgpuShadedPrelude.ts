import { unpackColorToLinear } from '@flighthq/color';
import { orderModifierStack } from '@flighthq/shading';
import type {
  AnimatedNormalModifier,
  DissolveModifier,
  EmissiveModifier,
  EnvReflectModifier,
  FogModifier,
  LinearColor,
  Modifier,
  RimModifier,
  ShadedMaterial,
  Texture,
  ToonModifier,
  VertexDisplaceModifier,
  WgpuMeshPipeline,
  WgpuRenderState,
} from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  DissolveModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  EnvReflectModifierKind,
  FogModifierKind,
  FogModifierMode,
  RimModifierKind,
  ToonModifierKind,
  VertexDisplaceModifierKind,
  VertexDisplaceModifierSource,
} from '@flighthq/types';

import { getWgpuShadedBaseFlags } from './shadedWgpuMeshMaterialRenderer';
import { getWgpuClassicModuleSourceForKey } from './wgpuClassicPrelude';
import {
  createWgpuMeshPipeline,
  ensureWgpuPbrSampleLayout,
  ensureWgpuScenePipeline,
  getWgpuMaterialSampler,
  resolveWgpuMaterialTextureView,
  stashWgpuUvTransform,
} from './wgpuMeshPipeline';
import { getWgpuSceneTime } from './wgpuSceneTime';

interface ShadedModifierPlan {
  fragmentDeclarations: string;
  normal: string;
  emissive: string;
  effect: string;
  textureBindings: readonly ShadedTextureBinding[];
  uniformFloatCount: number;
  vertex: string;
}

interface ShadedTextureBinding {
  binding: number;
  texture: Readonly<Texture> | null;
}

interface ShadedBinding {
  bindGroup: GPUBindGroup;
  buffer: GPUBuffer;
  layout: GPUBindGroupLayout;
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
  const plan = buildModifierPlan(material.modifiers);
  const byteLength = 48 + plan.uniformFloatCount * 4;
  let binding = shadedBindings.get(material);
  if (binding === undefined || binding.layout !== pipeline.materialBindGroupLayout) {
    const buffer = state.device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer } },
      { binding: 1, resource: getWgpuMaterialSampler(state, material.diffuseMap) },
      { binding: 2, resource: resolveWgpuMaterialTextureView(state, material.diffuseMap) },
      { binding: 3, resource: resolveWgpuMaterialTextureView(state, material.specularMap) },
      { binding: 4, resource: resolveWgpuMaterialTextureView(state, material.normalMap) },
      ...plan.textureBindings.map(({ binding: textureBinding, texture }) => ({
        binding: textureBinding,
        resource: resolveWgpuMaterialTextureView(state, texture),
      })),
    ];
    binding = {
      bindGroup: state.device.createBindGroup({ entries, layout: pipeline.materialBindGroupLayout }),
      buffer,
      layout: pipeline.materialBindGroupLayout,
    };
    shadedBindings.set(material, binding);
  }

  const data = new Float32Array(byteLength / 4);
  data.set(diffuse, 0);
  data.set(specular, 4);
  data[8] = material.shininess;
  data[9] = material.alphaCutoff;
  data[10] = getWgpuSceneTime(state);
  data[11] = material.normalScale;
  writeModifierUniforms(data, 12, orderModifierStack(material.modifiers));
  state.device.queue.writeBuffer(binding.buffer, 0, data.buffer, 0, byteLength);
  stashWgpuUvTransform(state, material.diffuseMap);
  return binding.bindGroup;
}

// Stable identity for one ShadedMaterial pipeline family. Base map/cull/mask flags precede the
// canonical ordered modifier signature; format and blend are added by the shared pipeline cache.
export function buildWgpuShadedCacheKey(material: Readonly<ShadedMaterial>): string {
  const flags = getWgpuShadedBaseFlags(material);
  const base = `${flags.alphaMaskEnabled ? 'm' : '-'}${flags.doubleSided ? 'd' : '-'}${
    flags.hasDiffuseMap ? 'd' : '-'
  }${flags.hasSpecularMap ? 's' : '-'}${flags.hasNormalMap ? 'n' : '-'}`;
  return `shaded:${base}|${buildModifierDefineKey(material.modifiers)}`;
}

// Resolves the immutable shader/layout/pipeline permutation. The shared cache appends opaque/blend,
// so modifier composition combines naturally with §1's transparent variants.
export function ensureWgpuShadedPipeline(
  state: WgpuRenderState,
  material: Readonly<ShadedMaterial>,
  format: GPUTextureFormat,
): WgpuMeshPipeline {
  const key = `${buildWgpuShadedCacheKey(material)}|${format}`;
  return ensureWgpuScenePipeline(state, key, (blended) => {
    const plan = buildModifierPlan(material.modifiers);
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
      ...plan.textureBindings.map(
        ({ binding }): GPUBindGroupLayoutEntry => ({
          binding,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        }),
      ),
    ];
    const materialBindGroupLayout = state.device.createBindGroupLayout({ entries });
    const module = state.device.createShaderModule({ code: getWgpuShadedModuleSource(material) });
    return createWgpuMeshPipeline(state, {
      blended,
      doubleSided: getWgpuShadedBaseFlags(material).doubleSided,
      format,
      materialBindGroupLayout,
      module,
      pbrSampleBindGroupLayout: ensureWgpuPbrSampleLayout(state),
    });
  });
}

// Creates the WGSL module for a ShadedMaterial variant. The lean base is the existing Blinn-Phong
// WGSL assembly; modifier declarations and slot contributions are spliced at stable semantic hooks.
// This keeps shared Frame/Draw/light/shadow behavior byte-for-byte aligned with classic WebGPU.
export function getWgpuShadedModuleSource(material: Readonly<ShadedMaterial>): string {
  const flags = getWgpuShadedBaseFlags(material);
  const plan = buildModifierPlan(material.modifiers);
  let source = getWgpuClassicModuleSourceForKey({
    alphaMaskEnabled: flags.alphaMaskEnabled,
    doubleSided: flags.doubleSided,
    hasDiffuseMap: flags.hasDiffuseMap,
    hasNormalMap: flags.hasNormalMap,
    hasSpecularMap: flags.hasSpecularMap,
    lightingModel: 'blinnphong',
  });

  source = source.replace(
    'let world = draw.world * vec4f(position, 1.0);',
    `var localPosition = vec4f(position, 1.0);
  let localNormal = normal;
  let vertexUv = uv;
${indent(plan.vertex, 2)}
  let world = draw.world * localPosition;`,
  );
  source = source.replace(
    'out.worldNormal = draw.normalMatrix * normal;',
    'out.worldNormal = draw.normalMatrix * localNormal;',
  );
  const modifierField =
    plan.uniformFloatCount === 0 ? '' : `\n  modifierData : array<vec4f, ${plan.uniformFloatCount / 4}>,`;
  source = source.replace(
    'params : vec4f,    // x = shininess, y = alphaCutoff',
    `params : vec4f,    // x = shininess, y = alphaCutoff, z = time, w = normalScale${modifierField}`,
  );

  const textureDeclarations = plan.textureBindings
    .map(({ binding }) => `@group(2) @binding(${binding}) var modifierTexture${binding} : texture_2d<f32>;`)
    .join('\n');
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
    '  return vec4f(radiance, diffuse.a * in.objectAlpha);',
    `  radiance = radiance + emissive;
${indent(plan.effect, 2)}
  return vec4f(radiance, diffuse.a * in.objectAlpha);`,
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
  return source;
}

function buildModifierDefineKey(modifiers: readonly Modifier[]): string {
  return orderModifierStack(modifiers)
    .map((modifier) => {
      if (modifier.kind === AnimatedNormalModifierKind) {
        const value = modifier as Readonly<AnimatedNormalModifier>;
        return `${modifier.kind}:${value.map === null ? '0' : value.secondaryMap === undefined ? '1' : '2'}`;
      }
      if (modifier.kind === EmissiveModifierKind) {
        const value = modifier as Readonly<EmissiveModifier>;
        return `${modifier.kind}:${value.mask === undefined ? '' : 'm'}${
          value.facing === undefined || value.facing === EmissiveModifierFacing.Ignore ? '' : 'g'
        }`;
      }
      if (modifier.kind === DissolveModifierKind) {
        return `${modifier.kind}:${(modifier as Readonly<DissolveModifier>).map === undefined ? 'p' : 'm'}`;
      }
      if (modifier.kind === FogModifierKind) {
        return `${modifier.kind}:${(modifier as Readonly<FogModifier>).mode ?? FogModifierMode.Linear}`;
      }
      if (modifier.kind === VertexDisplaceModifierKind) {
        const value = modifier as Readonly<VertexDisplaceModifier>;
        return `${modifier.kind}:${value.source}${value.axis === undefined ? '' : 'a'}${
          value.map === undefined ? '' : 'm'
        }`;
      }
      return modifier.kind;
    })
    .join('+');
}

function buildModifierPlan(modifiers: readonly Modifier[]): ShadedModifierPlan {
  const ordered = orderModifierStack(modifiers);
  const textures: ShadedTextureBinding[] = [];
  let normal = '';
  let emissive = '';
  let effect = '';
  let vertex = '';
  let fragmentDeclarations = '';
  for (let index = 0; index < ordered.length; index++) {
    const modifier = ordered[index];
    const base = index * MODIFIER_FLOATS;
    if (modifier.kind === AnimatedNormalModifierKind) {
      const value = modifier as Readonly<AnimatedNormalModifier>;
      if (value.map === null) continue;
      const primary = addTexture(textures, value.map);
      const secondary =
        value.secondaryMap === undefined
          ? ''
          : ` + textureSample(modifierTexture${addTexture(textures, value.secondaryMap)}, materialSampler, in.uv + material.modifierData[${base / 4 + 1}].xy * material.params.z).xyz * 2.0 - vec3f(1.0)`;
      normal += `{
  var animatedNormal = textureSample(modifierTexture${primary}, materialSampler, in.uv + material.modifierData[${
    base / 4
  }].xy * material.params.z).xyz * 2.0 - vec3f(1.0)${secondary};
  animatedNormal.x = animatedNormal.x * material.modifierData[${base / 4}].z;
  animatedNormal.y = animatedNormal.y * material.modifierData[${base / 4}].z;
  normal = normalize(tbn * animatedNormal);
}
`;
    } else if (modifier.kind === EmissiveModifierKind) {
      const value = modifier as Readonly<EmissiveModifier>;
      const mask =
        value.mask === undefined
          ? ''
          : ` * textureSample(modifierTexture${addTexture(textures, value.mask)}, materialSampler, in.uv).rgb`;
      const gated =
        value.facing === undefined || value.facing === EmissiveModifierFacing.Ignore
          ? ''
          : `
  let emissiveLightDir = select(vec3f(0.0, 0.0, 1.0), normalize(-frame.lightDirection.xyz), frame.lightDirection.w > 0.5);
  let emissiveFacing = dot(normal, emissiveLightDir) * material.modifierData[${base / 4 + 1}].x;
  let emissiveSoft = max(material.modifierData[${base / 4 + 1}].y, 0.0001);
  emissiveTerm = emissiveTerm * smoothstep(-emissiveSoft, emissiveSoft, emissiveFacing);`;
      emissive += `{
  var emissiveTerm = material.modifierData[${base / 4}].rgb * material.modifierData[${base / 4}].w${mask};${gated}
  emissive = emissive + emissiveTerm;
}
`;
    } else if (modifier.kind === RimModifierKind) {
      effect += `{
  let rimFactor = clamp(material.modifierData[${base / 4 + 1}].y + material.modifierData[${
    base / 4 + 1
  }].x * pow(1.0 - max(dot(normal, shadedViewDir), 0.0), max(material.modifierData[${base / 4}].w, 0.0001)), 0.0, 1.0);
  radiance = radiance + material.modifierData[${base / 4}].rgb * rimFactor;
}
`;
    } else if (modifier.kind === DissolveModifierKind) {
      const value = modifier as Readonly<DissolveModifier>;
      let noise: string;
      if (value.map === undefined) {
        fragmentDeclarations = VALUE_NOISE_WGSL;
        noise = `shadedValueNoise(in.uv * material.modifierData[${base / 4}].z)`;
      } else {
        noise = `textureSample(modifierTexture${addTexture(textures, value.map)}, materialSampler, in.uv).r`;
      }
      effect += `{
  let dissolveNoise = ${noise};
  if (dissolveNoise < material.modifierData[${base / 4}].x) { discard; }
  let dissolveEdge = 1.0 - smoothstep(material.modifierData[${base / 4}].x, material.modifierData[${
    base / 4
  }].x + max(material.modifierData[${base / 4}].y, 0.0001), dissolveNoise);
  radiance = mix(radiance, material.modifierData[${base / 4 + 1}].rgb, dissolveEdge);
}
`;
    } else if (modifier.kind === EnvReflectModifierKind) {
      effect += `{
  let envDirection = reflect(-shadedViewDir, normal);
  let envMip = clamp(material.modifierData[${base / 4 + 1}].y, 0.0, 1.0) * max(ibl.params.z, 0.0);
  let envSample = select(material.modifierData[${base / 4}].rgb, textureSampleLevel(iblPrefiltered, iblSampler, envDirection, envMip).rgb, ibl.params.x > 0.5);
  let envFresnel = material.modifierData[${base / 4 + 1}].x + (1.0 - material.modifierData[${
    base / 4 + 1
  }].x) * pow(1.0 - max(dot(normal, shadedViewDir), 0.0), 5.0);
  radiance = radiance + envSample * material.modifierData[${base / 4}].rgb * (material.modifierData[${
    base / 4
  }].w * envFresnel);
}
`;
    } else if (modifier.kind === FogModifierKind) {
      const value = modifier as Readonly<FogModifier>;
      const distance = `length(frame.cameraPosition.xyz - in.worldPosition)`;
      const factor =
        value.mode === FogModifierMode.Exponential
          ? `1.0 - exp(-material.modifierData[${base / 4 + 1}].x * ${distance})`
          : value.mode === FogModifierMode.Exponential2
            ? `1.0 - exp(-pow(material.modifierData[${base / 4 + 1}].x * ${distance}, 2.0))`
            : `clamp((${distance} - material.modifierData[${base / 4 + 1}].y) / max(material.modifierData[${
                base / 4 + 1
              }].z - material.modifierData[${base / 4 + 1}].y, 0.0001), 0.0, 1.0)`;
      effect += `radiance = mix(radiance, material.modifierData[${base / 4}].rgb, clamp(${factor}, 0.0, 1.0));\n`;
    } else if (modifier.kind === ToonModifierKind) {
      effect += `{
  let toonLum = dot(radiance, vec3f(0.2126, 0.7152, 0.0722));
  let toonSteps = max(material.modifierData[${base / 4}].x, 2.0);
  let toonScaled = toonLum * toonSteps;
  let toonBand = floor(toonScaled);
  let toonSoft = max(material.modifierData[${base / 4}].y, 0.0001);
  let toonQuant = (toonBand + smoothstep(0.5 - toonSoft, 0.5 + toonSoft, toonScaled - toonBand)) / toonSteps;
  radiance = radiance * select(1.0, toonQuant / toonLum, toonLum > 0.0001);
}
`;
    } else if (modifier.kind === VertexDisplaceModifierKind) {
      const value = modifier as Readonly<VertexDisplaceModifier>;
      const axis =
        value.axis === undefined ? 'normalize(localNormal)' : `normalize(material.modifierData[${base / 4 + 1}].xyz)`;
      const amount =
        value.source === VertexDisplaceModifierSource.HeightMap && value.map !== undefined
          ? `textureSampleLevel(modifierTexture${addTexture(textures, value.map)}, materialSampler, vertexUv, 0.0).r * material.modifierData[${
              base / 4
            }].x`
          : `sin(dot(localPosition.xyz, normalize(material.modifierData[${base / 4 + 2}].xyz)) * material.modifierData[${
              base / 4
            }].y + material.params.z * material.modifierData[${base / 4}].z) * material.modifierData[${base / 4}].x`;
      vertex += `localPosition = vec4f(localPosition.xyz + ${axis} * (${amount}), 1.0);\n`;
    }
  }
  return {
    effect,
    emissive,
    fragmentDeclarations,
    normal,
    textureBindings: textures,
    uniformFloatCount: ordered.length * MODIFIER_FLOATS,
    vertex,
  };
}

function addTexture(textures: ShadedTextureBinding[], texture: Readonly<Texture>): number {
  const binding = 5 + textures.length;
  textures.push({ binding, texture });
  return binding;
}

function writeModifierUniforms(out: Float32Array, offset: number, modifiers: readonly Modifier[]): void {
  for (let index = 0; index < modifiers.length; index++) {
    const modifier = modifiers[index];
    const base = offset + index * MODIFIER_FLOATS;
    if (modifier.kind === AnimatedNormalModifierKind) {
      const value = modifier as Readonly<AnimatedNormalModifier>;
      out[base] = value.scroll.x;
      out[base + 1] = value.scroll.y;
      out[base + 2] = value.strength ?? 1;
      out[base + 4] = value.secondaryScroll?.x ?? 0;
      out[base + 5] = value.secondaryScroll?.y ?? 0;
    } else if (modifier.kind === EmissiveModifierKind) {
      const value = modifier as Readonly<EmissiveModifier>;
      unpackColorToLinear(_color, value.color);
      out.set(_color.slice(0, 3), base);
      out[base + 3] = value.strength;
      out[base + 4] = value.facing === EmissiveModifierFacing.AwayFromLight ? -1 : 1;
      out[base + 5] = value.facingSoftness ?? 0;
    } else if (modifier.kind === RimModifierKind) {
      const value = modifier as Readonly<RimModifier>;
      unpackColorToLinear(_color, value.color);
      out.set(_color.slice(0, 3), base);
      out[base + 3] = value.power ?? 3;
      out[base + 4] = value.intensity ?? 1;
      out[base + 5] = value.bias ?? 0;
    } else if (modifier.kind === DissolveModifierKind) {
      const value = modifier as Readonly<DissolveModifier>;
      out[base] = value.threshold;
      out[base + 1] = value.edgeWidth ?? 0.05;
      out[base + 2] = value.scale ?? 8;
      unpackColorToLinear(_color, value.edgeColor);
      out.set(_color.slice(0, 3), base + 4);
    } else if (modifier.kind === EnvReflectModifierKind) {
      const value = modifier as Readonly<EnvReflectModifier>;
      unpackColorToLinear(_color, value.tint);
      out.set(_color.slice(0, 3), base);
      out[base + 3] = value.intensity ?? 1;
      out[base + 4] = value.fresnelBias ?? 0.04;
      out[base + 5] = value.roughness ?? 0;
    } else if (modifier.kind === FogModifierKind) {
      const value = modifier as Readonly<FogModifier>;
      unpackColorToLinear(_color, value.color);
      out.set(_color.slice(0, 3), base);
      out[base + 4] = value.density ?? 1;
      out[base + 5] = value.near ?? 0;
      out[base + 6] = value.far ?? 1;
    } else if (modifier.kind === ToonModifierKind) {
      const value = modifier as Readonly<ToonModifier>;
      out[base] = Math.max(value.steps, 2);
      out[base + 1] = value.smoothness ?? 0;
    } else if (modifier.kind === VertexDisplaceModifierKind) {
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
    }
  }
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
const shadedBindings = new WeakMap<ShadedMaterial, ShadedBinding>();
