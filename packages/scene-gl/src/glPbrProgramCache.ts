import type { GlPbrProgram, GlRenderState, GlPbrDefineKey } from '@flighthq/types';

import { resolveGlLitLocations } from './glLitProgram';
import { compileGlProgram, ensureGlSceneProgram } from './glMeshProgram';
import { buildGlPbrDefineKey, getGlPbrFragmentSourceForKey, getGlPbrVertexSourceForKey } from './glPbrPrelude';
import { getGlSceneRuntime } from './glSceneRuntime';
// Compiles the StandardPbr uber-shader for a define key, links it, and resolves its uniform
// locations. Pure GL work — no caching — used by ensureGlPbrProgram. Throws on a compile/link
// failure, which is a programmer error (a malformed prelude), not an expected runtime condition.
export function compileGlPbrProgram(gl: WebGL2RenderingContext, key: Readonly<GlPbrDefineKey>): GlPbrProgram {
  const vertexSource = getGlPbrVertexSourceForKey(key);
  const fragmentSource = getGlPbrFragmentSourceForKey(key);
  const program = compileGlProgram(gl, vertexSource, fragmentSource);
  return {
    ...resolveGlLitLocations(gl, program),
    program,
    locAlphaCutoff: gl.getUniformLocation(program, 'u_alphaCutoff'),
    locAnisotropyRotation: gl.getUniformLocation(program, 'u_anisotropyRotation'),
    locAnisotropyStrength: gl.getUniformLocation(program, 'u_anisotropyStrength'),
    locAttenuationColor: gl.getUniformLocation(program, 'u_attenuationColor'),
    locBaseColor: gl.getUniformLocation(program, 'u_baseColor'),
    locBaseColorMap: gl.getUniformLocation(program, 'u_baseColorMap'),
    locClearcoat: gl.getUniformLocation(program, 'u_clearcoat'),
    locClearcoatRoughness: gl.getUniformLocation(program, 'u_clearcoatRoughness'),
    locEmissive: gl.getUniformLocation(program, 'u_emissive'),
    locEmissiveMap: gl.getUniformLocation(program, 'u_emissiveMap'),
    locEmissiveStrength: gl.getUniformLocation(program, 'u_emissiveStrength'),
    locIridescence: gl.getUniformLocation(program, 'u_iridescence'),
    locIridescenceIor: gl.getUniformLocation(program, 'u_iridescenceIor'),
    locIridescenceThickness: gl.getUniformLocation(program, 'u_iridescenceThickness'),
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
    locSheenColor: gl.getUniformLocation(program, 'u_sheenColor'),
    locSheenRoughness: gl.getUniformLocation(program, 'u_sheenRoughness'),
    locSpecular: gl.getUniformLocation(program, 'u_specular'),
    locSpecularColor: gl.getUniformLocation(program, 'u_specularColor'),
    locSubsurface: gl.getUniformLocation(program, 'u_subsurface'),
    locSubsurfaceColor: gl.getUniformLocation(program, 'u_subsurfaceColor'),
    locThickness: gl.getUniformLocation(program, 'u_thickness'),
    locTransmission: gl.getUniformLocation(program, 'u_transmission'),
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
  };
}

// Resolves the StandardPbr program for a define key, compiling and caching it on first use through
// the shared scene program cache under the `pbr:` family namespace, so each variant is compiled at
// most once per state and reused every frame.
export function ensureGlPbrProgram(state: GlRenderState, key: Readonly<GlPbrDefineKey>): GlPbrProgram {
  // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
  // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
  const fullKey: GlPbrDefineKey = {
    ...key,
    hasSkin: getGlSceneRuntime(state).activeSkinnedRun,
  };
  return ensureGlSceneProgram(state, `pbr:${buildGlPbrDefineKey(fullKey)}`, (gl) => compileGlPbrProgram(gl, fullKey));
}
