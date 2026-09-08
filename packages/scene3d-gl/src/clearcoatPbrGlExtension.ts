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
      applySurface: '',
      contributeIbl: `
  float flightClearcoatFactor = clamp(u_flightClearcoat * flightClearcoatFactorSample(), 0.0, 1.0);
  float flightClearcoatRough = clamp(u_flightClearcoatRoughness * flightClearcoatRoughnessSample(), 0.04, 1.0);
  vec3 flightClearcoatN = flightClearcoatNormal(N, tangentDir, bitangentDir);
  float flightClearcoatNDotV = max(dot(flightClearcoatN, V), 1e-4);
  vec3 flightClearcoatF = fresnelSchlickRoughness(flightClearcoatNDotV, vec3(0.04), flightClearcoatRough) * flightClearcoatFactor;
  vec3 flightClearcoatR = reflect(-V, flightClearcoatN);
  vec3 flightClearcoatPrefiltered = textureLod(u_iblPrefiltered, flightClearcoatR, flightClearcoatRough * u_iblMaxMip).rgb;
  vec2 flightClearcoatBrdf = texture(u_iblBrdf, vec2(flightClearcoatNDotV, flightClearcoatRough)).rg;
  ambient = ambient * (1.0 - flightClearcoatF) +
    flightClearcoatPrefiltered * (flightClearcoatF * flightClearcoatBrdf.x + flightClearcoatBrdf.y) * occ * u_iblIntensity;`,
      contributePunctual: `
  float flightClearcoatFactor = clamp(u_flightClearcoat * flightClearcoatFactorSample(), 0.0, 1.0);
  float flightClearcoatRough = clamp(u_flightClearcoatRoughness * flightClearcoatRoughnessSample(), 0.04, 1.0);
  vec3 flightClearcoatN = flightClearcoatNormal(N, tangentDir, bitangentDir);
  float flightClearcoatNDotV = max(dot(flightClearcoatN, V), 1e-4);
  float flightClearcoatNDotL = max(dot(flightClearcoatN, L), 0.0);
  float flightClearcoatNDotH = max(dot(flightClearcoatN, halfVec), 0.0);
  float flightClearcoatD = distributionGgx(flightClearcoatNDotH, flightClearcoatRough);
  float flightClearcoatVis = visibilitySmith(flightClearcoatNDotV, flightClearcoatNDotL, flightClearcoatRough);
  vec3 flightClearcoatF = fresnelSchlick(vDotH, vec3(0.04)) * flightClearcoatFactor;
  direct = direct * (1.0 - flightClearcoatF) +
    flightClearcoatD * flightClearcoatVis * flightClearcoatF * lightColor * flightClearcoatNDotL;`,
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
float flightClearcoatRoughnessSample() { return ${roughnessMap ? 'texture(u_flightClearcoatRoughnessMap, flightClearcoatRoughnessUv()).g' : '1.0'}; }
vec3 flightClearcoatNormal(vec3 N, vec3 tangentDir, vec3 bitangentDir) {
  ${
    normalMap
      ? `vec3 tangentNormal = texture(u_flightClearcoatNormalMap, flightClearcoatNormalUv()).xyz * 2.0 - 1.0;
  tangentNormal.xy *= u_flightClearcoatNormalScale;
  vec3 T = normalize(tangentDir - N * dot(tangentDir, N));
  float handedness = dot(cross(N, T), bitangentDir) < 0.0 ? -1.0 : 1.0;
  vec3 B = normalize(cross(N, T)) * handedness;
  return normalize(mat3(T, B, N) * tangentNormal);`
      : 'return N;'
  }
}`,
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
