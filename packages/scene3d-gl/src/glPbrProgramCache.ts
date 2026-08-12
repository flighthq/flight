import { getGlColorAdjustmentMaterialFeature, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type {
  GlColorAdjustmentMaterialFeature,
  GlPbrExtensionShaderContribution,
  GlPbrProgram,
  GlRenderState,
  GlPbrDefineKey,
} from '@flighthq/types/contract';

import { resolveGlLitLocations } from './glLitProgram';
import { compileGlProgram, ensureGlScene3DProgram } from './glMeshProgram';
import { buildGlPbrDefineKey, getGlPbrFragmentSourceForKey, getGlPbrVertexSourceForKey } from './glPbrPrelude';
import { getGlScene3DRuntime } from './glScene3DRuntime';
// Compiles the StandardPbr uber-shader for a define key, links it, and resolves its uniform
// locations. Pure GL work — no caching — used by ensureGlPbrProgram. Throws on a compile/link
// failure, which is a programmer error (a malformed prelude), not an expected runtime condition.
export function compileGlPbrProgram(
  gl: WebGL2RenderingContext,
  key: Readonly<GlPbrDefineKey>,
  contributions: readonly GlPbrExtensionShaderContribution[] = [],
  colorAdjustmentFeature: Readonly<GlColorAdjustmentMaterialFeature> | null = null,
): GlPbrProgram {
  const vertexSource = getGlPbrVertexSourceForKey(key);
  const fragmentSource = getGlPbrFragmentSourceForKey(key, contributions, colorAdjustmentFeature);
  const program = compileGlProgram(gl, vertexSource, fragmentSource);
  return {
    ...resolveGlLitLocations(gl, program),
    program,
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locAlphaMap: gl.getUniformLocation(program, 'u_alphaMap'),
    locBaseColor: gl.getUniformLocation(program, 'u_baseColor'),
    locBaseColorMap: gl.getUniformLocation(program, 'u_baseColorMap'),
    locEmissive: gl.getUniformLocation(program, 'u_emissive'),
    locEmissiveMap: gl.getUniformLocation(program, 'u_emissiveMap'),
    locEmissiveStrength: gl.getUniformLocation(program, 'u_emissiveStrength'),
    locJointNormalTexture: gl.getUniformLocation(program, 'u_jointNormalTexture'),
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
    locMetallic: gl.getUniformLocation(program, 'u_metallic'),
    locMetallicRoughnessMap: gl.getUniformLocation(program, 'u_metallicRoughnessMap'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMap: gl.getUniformLocation(program, 'u_normalMap'),
    locNormalMatrix: gl.getUniformLocation(program, 'u_normalMatrix'),
    locNormalScale: gl.getUniformLocation(program, 'u_normalScale'),
    locOcclusionMap: gl.getUniformLocation(program, 'u_occlusionMap'),
    locOcclusionStrength: gl.getUniformLocation(program, 'u_occlusionStrength'),
    locRoughness: gl.getUniformLocation(program, 'u_roughness'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
  };
}

// Resolves the StandardPbr program for a define key, compiling and caching it on first use through
// the shared scene program cache under the `pbr:` family namespace, so each variant is compiled at
// most once per state and reused every frame.
export function ensureGlPbrProgram(
  state: GlRenderState,
  key: Readonly<GlPbrDefineKey>,
  contributions: readonly GlPbrExtensionShaderContribution[] = [],
): GlPbrProgram {
  // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
  // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
  const fullKey: GlPbrDefineKey = {
    ...key,
    hasColorAdjustment: getGlScene3DRuntime(state).activeColorAdjustmentRun,
    hasColorMatrix: getGlScene3DRuntime(state).activeColorMatrixRun,
    hasSkin: getGlScene3DRuntime(state).activeSkinnedRun,
  };
  const extensionKey = contributions.map((contribution) => contribution.key).join(',');
  const registryRevision = getGlRenderStateRuntime(state).registries.pbrExtensionRevision;
  return ensureGlScene3DProgram(
    state,
    `pbr:${buildGlPbrDefineKey(fullKey)}:${registryRevision}:${extensionKey}`,
    (gl) => compileGlPbrProgram(gl, fullKey, contributions, getGlColorAdjustmentMaterialFeature(state)),
  );
}
