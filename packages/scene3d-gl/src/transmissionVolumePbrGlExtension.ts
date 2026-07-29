import type {
  GlPbrExtensionRegistration,
  GlRenderState,
  TransmissionVolumePbrExtension,
} from '@flighthq/types/contract';
import { TransmissionVolumePbrExtensionKind } from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';

export const transmissionVolumePbrGlExtension: GlPbrExtensionRegistration = {
  bind(context, value): void {
    const extension = value as Readonly<TransmissionVolumePbrExtension>;
    context.setFloat('u_flightTransmission', extension.transmission);
    context.setFloat('u_flightTransmissionThickness', extension.thickness);
    context.setFloat('u_flightTransmissionIor', extension.ior);
    context.setFloat('u_flightAttenuationDistance', extension.attenuationDistance);
    context.setLinearColor('u_flightAttenuationColor', extension.attenuationColor);
    context.bindTexture(
      'u_flightTransmissionMap',
      'u_flightTransmissionMapUvSet',
      'u_flightTransmissionMapTransform',
      extension.transmissionMap,
      extension.transmissionMapUvSet,
    );
    context.bindTexture(
      'u_flightTransmissionThicknessMap',
      'u_flightTransmissionThicknessMapUvSet',
      'u_flightTransmissionThicknessMapTransform',
      extension.thicknessMap,
      extension.thicknessMapUvSet,
    );
    context.bindTransmissionSceneColor('u_flightTransmissionSceneColor', 'u_flightTransmissionMaxLod');
  },
  createShaderContribution(context, value) {
    const extension = value as Readonly<TransmissionVolumePbrExtension>;
    const transmissionMap = context.isTextureReady(extension.transmissionMap);
    const thicknessMap = context.isTextureReady(extension.thicknessMap);
    const sceneColor = context.hasTransmissionSceneColor();
    return {
      applySurface: '',
      contributeIbl: '',
      contributePunctual: '',
      finalize: sceneColor
        ? `
  float flightTransmissionFactor = clamp(u_flightTransmission * ${transmissionMap ? 'texture(u_flightTransmissionMap, flightTransmissionUv()).r' : '1.0'}, 0.0, 1.0);
  float flightTransmissionThickness = max(u_flightTransmissionThickness * ${thicknessMap ? 'texture(u_flightTransmissionThicknessMap, flightTransmissionThicknessUv()).g' : '1.0'}, 0.0);
  float flightTransmissionEta = 1.0 / max(u_flightTransmissionIor, 1.0);
  vec3 flightTransmissionRefracted = refract(-viewDir, normal, flightTransmissionEta);
  vec4 flightTransmissionRefractedClip = u_viewProjection * vec4(
    v_worldPosition + flightTransmissionRefracted * max(flightTransmissionThickness, 0.01), 1.0);
  vec2 flightTransmissionScreenUv =
    flightTransmissionRefractedClip.xy / max(flightTransmissionRefractedClip.w, 1e-5) * 0.5 + 0.5;
  float flightTransmissionLod = roughness * u_flightTransmissionMaxLod;
  vec3 flightTransmissionBackground = textureLod(
    u_flightTransmissionSceneColor, clamp(flightTransmissionScreenUv, vec2(0.0), vec2(1.0)), flightTransmissionLod).rgb;
  vec3 flightTransmissionAbsorption = u_flightAttenuationDistance > 0.0 && !isinf(u_flightAttenuationDistance)
    ? pow(max(u_flightAttenuationColor, vec3(1e-4)), vec3(flightTransmissionThickness / u_flightAttenuationDistance))
    : vec3(1.0);
  vec3 flightTransmissionFresnel = fresnelSchlick(max(dot(normal, viewDir), 0.0), f0);
  vec3 flightTransmissionThrough = flightTransmissionBackground * flightTransmissionAbsorption;
  radiance = mix(radiance, radiance * flightTransmissionFresnel + flightTransmissionThrough * (1.0 - flightTransmissionFresnel), flightTransmissionFactor);`
        : '',
      fragmentDeclarations: `
uniform float u_flightTransmission;
uniform float u_flightTransmissionThickness;
uniform float u_flightTransmissionIor;
uniform float u_flightAttenuationDistance;
uniform vec3 u_flightAttenuationColor;
${sceneColor ? 'uniform sampler2D u_flightTransmissionSceneColor;' : ''}
${sceneColor ? 'uniform float u_flightTransmissionMaxLod; uniform mat4 u_viewProjection;' : ''}
${transmissionMap ? 'uniform sampler2D u_flightTransmissionMap; uniform int u_flightTransmissionMapUvSet; uniform mat3 u_flightTransmissionMapTransform;' : ''}
${thicknessMap ? 'uniform sampler2D u_flightTransmissionThicknessMap; uniform int u_flightTransmissionThicknessMapUvSet; uniform mat3 u_flightTransmissionThicknessMapTransform;' : ''}`,
      fragmentFunctions: `
${transmissionMap ? 'vec2 flightTransmissionUv() { vec2 uv = u_flightTransmissionMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightTransmissionMapTransform * vec3(uv, 1.0)).xy; }' : ''}
${thicknessMap ? 'vec2 flightTransmissionThicknessUv() { vec2 uv = u_flightTransmissionThicknessMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0; return (u_flightTransmissionThicknessMapTransform * vec3(uv, 1.0)).xy; }' : ''}`,
      key: `transmission:${sceneColor ? 's' : '-'}${transmissionMap ? 'f' : '-'}${thicknessMap ? 't' : '-'}`,
      samplesTransmissionSceneColor: sceneColor,
      textureCount: Number(sceneColor) + Number(transmissionMap) + Number(thicknessMap),
    };
  },
  isSupported(): boolean {
    return true;
  },
};

export function registerTransmissionVolumePbrGlExtension(state: GlRenderState): void {
  registerGlPbrExtension(state, TransmissionVolumePbrExtensionKind, transmissionVolumePbrGlExtension);
}
