import type { GlPbrExtensionRegistration, GlRenderState, IridescencePbrExtension } from '@flighthq/types/contract';
import { IridescencePbrExtensionKind } from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';

export const iridescencePbrGlExtension: GlPbrExtensionRegistration = {
  bind(context, value): void {
    const extension = value as Readonly<IridescencePbrExtension>;
    context.setFloat('u_flightIridescence', extension.iridescence);
    context.setFloat('u_flightIridescenceIor', extension.iridescenceIor);
    context.setFloat('u_flightIridescenceThicknessMin', extension.iridescenceThicknessMin);
    context.setFloat('u_flightIridescenceThicknessMax', extension.iridescenceThicknessMax);
    context.bindTexture(
      'u_flightIridescenceMap',
      'u_flightIridescenceMapUvSet',
      'u_flightIridescenceMapTransform',
      extension.iridescenceMap,
      extension.iridescenceMapUvSet,
    );
    context.bindTexture(
      'u_flightIridescenceThicknessMap',
      'u_flightIridescenceThicknessMapUvSet',
      'u_flightIridescenceThicknessMapTransform',
      extension.iridescenceThicknessMap,
      extension.iridescenceThicknessMapUvSet,
    );
  },
  createShaderContribution(context, value) {
    const extension = value as Readonly<IridescencePbrExtension>;
    const factorMap = context.isTextureReady(extension.iridescenceMap);
    const thicknessMap = context.isTextureReady(extension.iridescenceThicknessMap);
    return {
      applySurface: `
  float flightIridescenceFactor = clamp(u_flightIridescence * flightIridescenceFactorSample(), 0.0, 1.0);
  float flightIridescenceThickness = mix(u_flightIridescenceThicknessMin, u_flightIridescenceThicknessMax, flightIridescenceThicknessSample());
  f0 = mix(f0, flightIridescentFresnel(nDotV, f0, flightIridescenceThickness, u_flightIridescenceIor), flightIridescenceFactor);`,
      contributeIbl: '',
      contributePunctual: '',
      finalize: '',
      fragmentDeclarations: `
uniform float u_flightIridescence;
uniform float u_flightIridescenceIor;
uniform float u_flightIridescenceThicknessMin;
uniform float u_flightIridescenceThicknessMax;
${factorMap ? 'uniform sampler2D u_flightIridescenceMap; uniform int u_flightIridescenceMapUvSet; uniform mat3 u_flightIridescenceMapTransform;' : ''}
${thicknessMap ? 'uniform sampler2D u_flightIridescenceThicknessMap; uniform int u_flightIridescenceThicknessMapUvSet; uniform mat3 u_flightIridescenceThicknessMapTransform;' : ''}`,
      fragmentFunctions: `
${factorMap ? 'vec2 flightIridescenceUv() { vec2 uv = u_flightIridescenceMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightIridescenceMapTransform * vec3(uv, 1.0)).xy; }' : ''}
${thicknessMap ? 'vec2 flightIridescenceThicknessUv() { vec2 uv = u_flightIridescenceThicknessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightIridescenceThicknessMapTransform * vec3(uv, 1.0)).xy; }' : ''}
float flightIridescenceFactorSample() { return ${factorMap ? 'texture(u_flightIridescenceMap, flightIridescenceUv()).r' : '1.0'}; }
float flightIridescenceThicknessSample() { return ${thicknessMap ? 'texture(u_flightIridescenceThicknessMap, flightIridescenceThicknessUv()).g' : '1.0'}; }
vec3 flightIridescentFresnel(float cosTheta, vec3 baseF0, float thicknessNm, float filmIor) {
  float opd = 2.0 * filmIor * thicknessNm * cosTheta;
  vec3 phase = 2.0 * PI * opd / vec3(580.0, 540.0, 460.0);
  vec3 shift = 0.5 + 0.5 * cos(phase);
  return mix(fresnelSchlick(cosTheta, baseF0), shift, clamp(thicknessNm / 1000.0, 0.0, 1.0));
}`,
      key: `iridescence:${factorMap ? 'f' : '-'}${thicknessMap ? 't' : '-'}`,
      textureCount: Number(factorMap) + Number(thicknessMap),
    };
  },
  isSupported(): boolean {
    return true;
  },
};

export function registerGlIridescencePbrExtension(state: GlRenderState): void {
  registerGlPbrExtension(state, IridescencePbrExtensionKind, iridescencePbrGlExtension);
}
