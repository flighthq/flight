import type { GlPbrExtensionRegistration, GlRenderState, SpecularPbrExtension } from '@flighthq/types/contract';
import { SpecularPbrExtensionKind } from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';

export const specularPbrGlExtension: GlPbrExtensionRegistration = {
  bind(context, value): void {
    const extension = value as Readonly<SpecularPbrExtension>;
    context.setFloat('u_flightSpecular', extension.specular);
    context.setLinearColor('u_flightSpecularColor', extension.specularColor);
    context.bindTexture(
      'u_flightSpecularMap',
      'u_flightSpecularMapUvSet',
      'u_flightSpecularMapTransform',
      extension.specularMap,
      extension.specularMapUvSet,
    );
    context.bindTexture(
      'u_flightSpecularColorMap',
      'u_flightSpecularColorMapUvSet',
      'u_flightSpecularColorMapTransform',
      extension.specularColorMap,
      extension.specularColorMapUvSet,
    );
  },
  createShaderContribution(context, value) {
    const extension = value as Readonly<SpecularPbrExtension>;
    const factorMap = context.isTextureReady(extension.specularMap);
    const colorMap = context.isTextureReady(extension.specularColorMap);
    return {
      applySurface: `
  float flightSpecularFactor = u_flightSpecular * ${factorMap ? 'texture(u_flightSpecularMap, flightSpecularUv()).a' : '1.0'};
  vec3 flightSpecularColor = u_flightSpecularColor * ${colorMap ? 'texture(u_flightSpecularColorMap, flightSpecularColorUv()).rgb' : 'vec3(1.0)'};
  f0 = mix(min(0.04 * flightSpecularColor, vec3(1.0)) * flightSpecularFactor, albedo, metallic);`,
      contributeIbl: '',
      contributePunctual: '',
      finalize: '',
      fragmentDeclarations: `
uniform float u_flightSpecular;
uniform vec3 u_flightSpecularColor;
${factorMap ? 'uniform sampler2D u_flightSpecularMap; uniform int u_flightSpecularMapUvSet; uniform mat3 u_flightSpecularMapTransform;' : ''}
${colorMap ? 'uniform sampler2D u_flightSpecularColorMap; uniform int u_flightSpecularColorMapUvSet; uniform mat3 u_flightSpecularColorMapTransform;' : ''}`,
      fragmentFunctions: `
${factorMap ? 'vec2 flightSpecularUv() { vec2 uv = u_flightSpecularMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSpecularMapTransform * vec3(uv, 1.0)).xy; }' : ''}
${colorMap ? 'vec2 flightSpecularColorUv() { vec2 uv = u_flightSpecularColorMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightSpecularColorMapTransform * vec3(uv, 1.0)).xy; }' : ''}`,
      key: `specular:${factorMap ? 'f' : '-'}${colorMap ? 'c' : '-'}`,
      textureCount: Number(factorMap) + Number(colorMap),
    };
  },
  isSupported(): boolean {
    return true;
  },
};

export function registerGlSpecularPbrExtension(state: GlRenderState): void {
  registerGlPbrExtension(state, SpecularPbrExtensionKind, specularPbrGlExtension);
}
