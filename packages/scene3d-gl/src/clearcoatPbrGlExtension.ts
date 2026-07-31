import type {
  ClearcoatPbrExtension,
  GlPbrExtensionBindContext,
  GlPbrExtensionRegistration,
  GlRenderState,
  PbrUvSet,
  Texture,
} from '@flighthq/types/contract';
import { ClearcoatPbrExtensionKind } from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';

export const clearcoatPbrGlExtension: GlPbrExtensionRegistration = {
  bind(context, value): void {
    const extension = value as Readonly<ClearcoatPbrExtension>;
    context.setFloat('u_flightClearcoat', extension.clearcoat);
    context.setFloat('u_flightClearcoatRoughness', extension.clearcoatRoughness);
    context.setFloat('u_flightClearcoatNormalScale', extension.clearcoatNormalScale);
    bindMap(context, 'Clearcoat', extension.clearcoatMap, extension.clearcoatMapUvSet);
    bindMap(context, 'ClearcoatRoughness', extension.clearcoatRoughnessMap, extension.clearcoatRoughnessMapUvSet);
    bindMap(context, 'ClearcoatNormal', extension.clearcoatNormalMap, extension.clearcoatNormalMapUvSet);
  },
  createShaderContribution(context, value) {
    const extension = value as Readonly<ClearcoatPbrExtension>;
    const factorMap = context.isTextureReady(extension.clearcoatMap);
    const roughnessMap = context.isTextureReady(extension.clearcoatRoughnessMap);
    const normalMap = context.isTextureReady(extension.clearcoatNormalMap);
    return {
      applySurface: normalMap
        ? `
  vec3 flightClearcoatTangentNormal = texture(u_flightClearcoatNormalMap, flightClearcoatNormalUv()).xyz * 2.0 - 1.0;
  flightClearcoatTangentNormal.xy *= u_flightClearcoatNormalScale;
  normal = normalize(mat3(tangent, bitangent, normal) * flightClearcoatTangentNormal);
  nDotV = max(dot(normal, viewDir), 1e-4);`
        : '',
      contributeIbl: `
  float flightClearcoatFactor = clamp(u_flightClearcoat * flightClearcoatFactorSample(), 0.0, 1.0);
  float flightClearcoatRough = clamp(u_flightClearcoatRoughness * flightClearcoatRoughnessSample(), 0.04, 1.0);
  vec3 flightClearcoatF = fresnelSchlickRoughness(max(dot(N, V), 1e-4), vec3(0.04), flightClearcoatRough) * flightClearcoatFactor;
  vec3 flightClearcoatR = reflect(-V, N);
  vec3 flightClearcoatPrefiltered = textureLod(u_iblPrefiltered, flightClearcoatR, flightClearcoatRough * u_iblMaxMip).rgb;
  vec2 flightClearcoatBrdf = texture(u_iblBrdf, vec2(max(dot(N, V), 1e-4), flightClearcoatRough)).rg;
  ambient = ambient * (1.0 - flightClearcoatF) +
    flightClearcoatPrefiltered * (flightClearcoatF * flightClearcoatBrdf.x + flightClearcoatBrdf.y) * occ * u_iblIntensity;`,
      contributePunctual: `
  float flightClearcoatFactor = clamp(u_flightClearcoat * flightClearcoatFactorSample(), 0.0, 1.0);
  float flightClearcoatRough = clamp(u_flightClearcoatRoughness * flightClearcoatRoughnessSample(), 0.04, 1.0);
  float flightClearcoatD = distributionGgx(nDotH, flightClearcoatRough);
  float flightClearcoatVis = visibilitySmith(nDotV, nDotL, flightClearcoatRough);
  vec3 flightClearcoatF = fresnelSchlick(vDotH, vec3(0.04)) * flightClearcoatFactor;
  direct = direct * (1.0 - flightClearcoatF) +
    flightClearcoatD * flightClearcoatVis * flightClearcoatF * lightColor * nDotL;`,
      finalize: '',
      fragmentDeclarations: `
uniform float u_flightClearcoat;
uniform float u_flightClearcoatRoughness;
uniform float u_flightClearcoatNormalScale;
${mapDeclarations('Clearcoat', factorMap)}
${mapDeclarations('ClearcoatRoughness', roughnessMap)}
${mapDeclarations('ClearcoatNormal', normalMap)}`,
      fragmentFunctions: `
${mapUvFunction('Clearcoat', factorMap)}
${mapUvFunction('ClearcoatRoughness', roughnessMap)}
${mapUvFunction('ClearcoatNormal', normalMap)}
float flightClearcoatFactorSample() { return ${factorMap ? 'texture(u_flightClearcoatMap, flightClearcoatUv()).r' : '1.0'}; }
float flightClearcoatRoughnessSample() { return ${roughnessMap ? 'texture(u_flightClearcoatRoughnessMap, flightClearcoatRoughnessUv()).g' : '1.0'}; }`,
      key: `clearcoat:${factorMap ? 'f' : '-'}${roughnessMap ? 'r' : '-'}${normalMap ? 'n' : '-'}`,
      textureCount: Number(factorMap) + Number(roughnessMap) + Number(normalMap),
    };
  },
  isSupported(): boolean {
    return true;
  },
};

export function registerGlClearcoatPbrExtension(state: GlRenderState): void {
  registerGlPbrExtension(state, ClearcoatPbrExtensionKind, clearcoatPbrGlExtension);
}

function bindMap(
  context: GlPbrExtensionBindContext,
  name: string,
  texture: Readonly<Texture> | null,
  uvSet: PbrUvSet,
): void {
  context.bindTexture(`u_flight${name}Map`, `u_flight${name}MapUvSet`, `u_flight${name}MapTransform`, texture, uvSet);
}
function mapDeclarations(name: string, enabled: boolean): string {
  return enabled
    ? `uniform sampler2D u_flight${name}Map; uniform int u_flight${name}MapUvSet; uniform mat3 u_flight${name}MapTransform;`
    : '';
}
function mapUvFunction(name: string, enabled: boolean): string {
  return enabled
    ? `vec2 flight${name}Uv() { vec2 uv = u_flight${name}MapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flight${name}MapTransform * vec3(uv, 1.0)).xy; }`
    : '';
}
