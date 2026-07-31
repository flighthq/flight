import type { GlPbrExtensionRegistration, GlRenderState, WrappedDiffusePbrExtension } from '@flighthq/types/contract';
import { WrappedDiffusePbrExtensionKind } from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';

export const wrappedDiffusePbrGlExtension: GlPbrExtensionRegistration = {
  bind(context, value): void {
    const extension = value as Readonly<WrappedDiffusePbrExtension>;
    context.setFloat('u_flightWrappedDiffuseStrength', extension.wrappedDiffuseStrength);
    context.setFloat('u_flightWrappedDiffuseThickness', extension.thickness);
    context.setLinearColor('u_flightWrappedDiffuseColor', extension.wrappedDiffuseColor);
    context.bindTexture(
      'u_flightWrappedDiffuseMap',
      'u_flightWrappedDiffuseMapUvSet',
      'u_flightWrappedDiffuseMapTransform',
      extension.wrappedDiffuseMap,
      extension.wrappedDiffuseMapUvSet,
    );
    context.bindTexture(
      'u_flightWrappedDiffuseThicknessMap',
      'u_flightWrappedDiffuseThicknessMapUvSet',
      'u_flightWrappedDiffuseThicknessMapTransform',
      extension.thicknessMap,
      extension.thicknessMapUvSet,
    );
  },
  createShaderContribution(context, value) {
    const extension = value as Readonly<WrappedDiffusePbrExtension>;
    const factorMap = context.isTextureReady(extension.wrappedDiffuseMap);
    const thicknessMap = context.isTextureReady(extension.thicknessMap);
    const factor = factorMap ? 'texture(u_flightWrappedDiffuseMap, flightWrappedDiffuseUv()).r' : '1.0';
    const thickness = thicknessMap
      ? 'texture(u_flightWrappedDiffuseThicknessMap, flightWrappedDiffuseThicknessUv()).g'
      : '1.0';
    return {
      applySurface: '',
      contributeIbl: `
  float flightWrappedIblStrength = u_flightWrappedDiffuseStrength * ${factor};
  float flightWrappedIblThickness = u_flightWrappedDiffuseThickness * ${thickness};
  ambient += u_flightWrappedDiffuseColor * diffuseColor * flightWrappedIblStrength /
    (1.0 + flightWrappedIblThickness) * occ * u_iblIntensity * 0.25;`,
      contributePunctual: `
  float flightWrappedStrength = u_flightWrappedDiffuseStrength * ${factor};
  float flightWrappedThickness = u_flightWrappedDiffuseThickness * ${thickness};
  float flightWrap = clamp((dot(N, L) + 0.5) / 2.25, 0.0, 1.0);
  direct += flightWrappedStrength / (1.0 + flightWrappedThickness) * flightWrap *
    u_flightWrappedDiffuseColor * diffuseColor * lightColor;`,
      finalize: '',
      fragmentDeclarations: `
uniform float u_flightWrappedDiffuseStrength;
uniform float u_flightWrappedDiffuseThickness;
uniform vec3 u_flightWrappedDiffuseColor;
${factorMap ? 'uniform sampler2D u_flightWrappedDiffuseMap; uniform int u_flightWrappedDiffuseMapUvSet; uniform mat3 u_flightWrappedDiffuseMapTransform;' : ''}
${thicknessMap ? 'uniform sampler2D u_flightWrappedDiffuseThicknessMap; uniform int u_flightWrappedDiffuseThicknessMapUvSet; uniform mat3 u_flightWrappedDiffuseThicknessMapTransform;' : ''}`,
      fragmentFunctions: `
${factorMap ? 'vec2 flightWrappedDiffuseUv() { vec2 uv = u_flightWrappedDiffuseMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightWrappedDiffuseMapTransform * vec3(uv, 1.0)).xy; }' : ''}
${thicknessMap ? 'vec2 flightWrappedDiffuseThicknessUv() { vec2 uv = u_flightWrappedDiffuseThicknessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightWrappedDiffuseThicknessMapTransform * vec3(uv, 1.0)).xy; }' : ''}`,
      key: `wrapped-diffuse:${factorMap ? 'f' : '-'}${thicknessMap ? 't' : '-'}`,
      textureCount: Number(factorMap) + Number(thicknessMap),
    };
  },
  isSupported(): boolean {
    return true;
  },
};

export function registerGlWrappedDiffusePbrExtension(state: GlRenderState): void {
  registerGlPbrExtension(state, WrappedDiffusePbrExtensionKind, wrappedDiffusePbrGlExtension);
}
