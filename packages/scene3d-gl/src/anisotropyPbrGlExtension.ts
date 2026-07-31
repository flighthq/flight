import type { AnisotropyPbrExtension, GlPbrExtensionRegistration, GlRenderState } from '@flighthq/types/contract';
import { AnisotropyPbrExtensionKind } from '@flighthq/types/contract';

import { registerGlPbrExtension } from './glPbrExtensionRegistry';

export const anisotropyPbrGlExtension: GlPbrExtensionRegistration = {
  bind(context, value): void {
    const extension = value as Readonly<AnisotropyPbrExtension>;
    context.setFloat('u_flightAnisotropyStrength', extension.anisotropyStrength);
    context.setFloat('u_flightAnisotropyRotation', extension.anisotropyRotation);
    context.bindTexture(
      'u_flightAnisotropyMap',
      'u_flightAnisotropyMapUvSet',
      'u_flightAnisotropyMapTransform',
      extension.anisotropyMap,
      extension.anisotropyMapUvSet,
    );
  },
  createShaderContribution(context, value) {
    const extension = value as Readonly<AnisotropyPbrExtension>;
    const hasMap = context.isTextureReady(extension.anisotropyMap);
    return {
      applySurface: '',
      contributeIbl: `
  float flightAnisotropyIblStrength = clamp(u_flightAnisotropyStrength * flightAnisotropySample().z, 0.0, 1.0);
  float flightAnisotropyAngle = u_flightAnisotropyRotation + atan(flightAnisotropySample().y, flightAnisotropySample().x);
  vec3 flightAnisotropyTangent = normalize(cos(flightAnisotropyAngle) * tangentDir + sin(flightAnisotropyAngle) * bitangentDir);
  vec3 flightAnisotropyReflection = normalize(mix(reflect(-V, N), flightAnisotropyTangent, flightAnisotropyIblStrength * rough * 0.35));
  vec3 flightAnisotropyPrefiltered = textureLod(u_iblPrefiltered, flightAnisotropyReflection, rough * u_iblMaxMip).rgb;
  ambient += (flightAnisotropyPrefiltered - prefiltered) * (F * brdf.x + brdf.y) * flightAnisotropyIblStrength * occ * u_iblIntensity;`,
      contributePunctual: `
  vec3 flightAnisotropyData = flightAnisotropySample();
  float flightAnisotropyStrength = clamp(u_flightAnisotropyStrength * flightAnisotropyData.z, 0.0, 1.0);
  float flightAnisotropyAngle = u_flightAnisotropyRotation + atan(flightAnisotropyData.y, flightAnisotropyData.x);
  vec3 flightAnisotropyTangent = normalize(cos(flightAnisotropyAngle) * tangentDir + sin(flightAnisotropyAngle) * bitangentDir);
  vec3 flightAnisotropyBitangent = normalize(cross(N, flightAnisotropyTangent));
  float flightAt = max(roughness * roughness * (1.0 + flightAnisotropyStrength), 1e-3);
  float flightAb = max(roughness * roughness * (1.0 - flightAnisotropyStrength), 1e-3);
  float flightAnisotropyD = flightDistributionGgxAnisotropic(
    nDotH, dot(flightAnisotropyTangent, halfVec), dot(flightAnisotropyBitangent, halfVec), flightAt, flightAb);
  direct += (flightAnisotropyD - d) * vis * fresnel * lightColor * nDotL;`,
      finalize: '',
      fragmentDeclarations: `
uniform float u_flightAnisotropyStrength;
uniform float u_flightAnisotropyRotation;
${hasMap ? 'uniform sampler2D u_flightAnisotropyMap;\nuniform int u_flightAnisotropyMapUvSet;\nuniform mat3 u_flightAnisotropyMapTransform;' : ''}`,
      fragmentFunctions: `
vec3 flightAnisotropySample() {
${hasMap ? '  vec2 uv = u_flightAnisotropyMapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0;\n  vec3 value = texture(u_flightAnisotropyMap, (u_flightAnisotropyMapTransform * vec3(uv, 1.0)).xy).rgb;\n  return vec3(value.rg * 2.0 - 1.0, value.b);' : '  return vec3(1.0, 0.0, 1.0);'}
}
float flightDistributionGgxAnisotropic(float nDotH, float tDotH, float bDotH, float at, float ab) {
  float value = tDotH * tDotH / (at * at) + bDotH * bDotH / (ab * ab) + nDotH * nDotH;
  return 1.0 / max(PI * at * ab * value * value, 1e-7);
}`,
      key: `anisotropy:${hasMap ? 'm' : '-'}`,
      textureCount: hasMap ? 1 : 0,
    };
  },
  isSupported(): boolean {
    return true;
  },
};

export function registerGlAnisotropyPbrExtension(state: GlRenderState): void {
  registerGlPbrExtension(state, AnisotropyPbrExtensionKind, anisotropyPbrGlExtension);
}
