import type { GlPbrExtensionRegistration, GlRenderState, SheenPbrExtension } from '@flighthq/types/contract';
import { SheenPbrExtensionKind } from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';

export const sheenPbrGlExtension: GlPbrExtensionRegistration = {
  bind(context, value): void {
    const extension = value as Readonly<SheenPbrExtension>;
    context.setLinearColor('u_flightSheenColor', extension.sheenColor);
    context.setFloat('u_flightSheenRoughness', extension.sheenRoughness);
    context.bindTexture(
      'u_flightSheenColorMap',
      'u_flightSheenColorMapUvSet',
      'u_flightSheenColorMapTransform',
      extension.sheenColorMap,
      extension.sheenColorMapUvSet,
    );
    context.bindTexture(
      'u_flightSheenRoughnessMap',
      'u_flightSheenRoughnessMapUvSet',
      'u_flightSheenRoughnessMapTransform',
      extension.sheenRoughnessMap,
      extension.sheenRoughnessMapUvSet,
    );
  },
  createShaderContribution(context, value) {
    const extension = value as Readonly<SheenPbrExtension>;
    const colorMap = context.isTextureReady(extension.sheenColorMap);
    const roughnessMap = context.isTextureReady(extension.sheenRoughnessMap);
    return {
      applySurface: '',
      contributeIbl: `
  vec3 flightSheenColor = u_flightSheenColor * ${colorMap ? 'srgbToLinear(texture(u_flightSheenColorMap, flightSheenColorUv()).rgb)' : 'vec3(1.0)'};
  float flightSheenRoughness = clamp(u_flightSheenRoughness * ${roughnessMap ? 'texture(u_flightSheenRoughnessMap, flightSheenRoughnessUv()).a' : '1.0'}, 0.07, 1.0);
  vec3 flightSheenR = reflect(-V, N);
  ambient += flightSheenColor * textureLod(u_iblPrefiltered, flightSheenR, flightSheenRoughness * u_iblMaxMip).rgb *
    (1.0 - max(max(F.r, F.g), F.b)) * occ * u_iblIntensity;`,
      contributePunctual: `
  vec3 flightSheenColor = u_flightSheenColor * ${colorMap ? 'srgbToLinear(texture(u_flightSheenColorMap, flightSheenColorUv()).rgb)' : 'vec3(1.0)'};
  float flightSheenRoughness = clamp(u_flightSheenRoughness * ${roughnessMap ? 'texture(u_flightSheenRoughnessMap, flightSheenRoughnessUv()).a' : '1.0'}, 0.07, 1.0);
  float flightSheenD = flightDistributionCharlie(nDotH, flightSheenRoughness);
  float flightSheenV = 1.0 / max(4.0 * (nDotL + nDotV - nDotL * nDotV), 1e-4);
  direct += flightSheenColor * flightSheenD * flightSheenV * lightColor * nDotL;`,
      finalize: '',
      fragmentDeclarations: `
uniform vec3 u_flightSheenColor;
uniform float u_flightSheenRoughness;
${colorMap ? 'uniform sampler2D u_flightSheenColorMap; uniform int u_flightSheenColorMapUvSet; uniform mat3 u_flightSheenColorMapTransform;' : ''}
${roughnessMap ? 'uniform sampler2D u_flightSheenRoughnessMap; uniform int u_flightSheenRoughnessMapUvSet; uniform mat3 u_flightSheenRoughnessMapTransform;' : ''}`,
      fragmentFunctions: `
${colorMap ? 'vec2 flightSheenColorUv() { vec2 uv = u_flightSheenColorMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSheenColorMapTransform * vec3(uv, 1.0)).xy; }' : ''}
${roughnessMap ? 'vec2 flightSheenRoughnessUv() { vec2 uv = u_flightSheenRoughnessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSheenRoughnessMapTransform * vec3(uv, 1.0)).xy; }' : ''}
float flightDistributionCharlie(float nDotH, float roughnessValue) {
  float inverseRoughness = 1.0 / roughnessValue;
  return (2.0 + inverseRoughness) * pow(max(1.0 - nDotH * nDotH, 1e-4), inverseRoughness * 0.5) / (2.0 * PI);
}`,
      key: `sheen:${colorMap ? 'c' : '-'}${roughnessMap ? 'r' : '-'}`,
      textureCount: Number(colorMap) + Number(roughnessMap),
    };
  },
  isSupported(): boolean {
    return true;
  },
};

export function registerSheenPbrGlExtension(state: GlRenderState): void {
  registerGlPbrExtension(state, SheenPbrExtensionKind, sheenPbrGlExtension);
}
