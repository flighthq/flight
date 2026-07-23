import { unpackColorToLinear } from '@flighthq/color';
import { hasImageResourcePixels } from '@flighthq/image';
import { bindGlImageResourceTexture } from '@flighthq/render-gl';
import { orderModifierStack, resolveModifier } from '@flighthq/shading';
import type { ModifierRegistry } from '@flighthq/shading';
import type { LinearColor } from '@flighthq/types';
import type {
  Camera3D,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  Modifier,
  SceneLightBlock,
  SceneRenderProxy,
  ShadedMaterial,
} from '@flighthq/types';
import { ShadedMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import {
  beginGlMeshDraw,
  bindGlUvTransform,
  drawGlMeshSubset,
  hasGlUvTransform,
  setGlMeshCameraPosition,
  setGlMeshViewProjection,
} from './glMeshProgram';
import { getGlSceneRuntime } from './glSceneRuntime';
import { getGlSceneTime } from './glSceneTime';
import type { GlModifierBindContext, GlModifierSnippet } from './glShadedModifierSnippet';
import type { GlShadedDefineKey, GlShadedProgram } from './glShadedPrelude';
import { ensureGlShadedProgram } from './glShadedPrelude';

// The built-in ShadedMaterial forward-lit mesh-material renderer — @flighthq/shading's composable
// base material on Gl. bind assembles ONE program from the base blinn-phong lit shader plus the
// material's ordered modifier stack (a third assembly over the shared light block, keyed by the
// stack's feature-set define-key), uploads the camera view-projection + position, the packed light
// block, the base diffuse/specular/normal uniforms and maps, the per-frame `time`, then each
// modifier's uniforms. A plain ShadedMaterial (empty modifier stack) compiles the lean base variant
// and skips the modifier bind entirely. See registerShadedGlMaterial to install it, and
// registerBuiltInGlModifierSnippets to enable the built-in modifiers.
export const shadedGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera3D>,
  ): void {
    const gl = state.gl;
    const shaded = material as Readonly<ShadedMaterial> | null;
    const modifiers = shaded !== null ? shaded.modifiers : EMPTY_MODIFIERS;
    const program = ensureGlShadedProgram(state, defineKeyForMaterial(shaded), modifiers);
    beginGlMeshDraw(state, program, shaded !== null && shaded.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlShadedMaterialUniforms(state, program, shaded);
    gl.uniform1f(program.locTime, getGlSceneTime(state));
    if (modifiers.length > 0) bindGlShadedModifiers(state, program, modifiers);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Registers the built-in ShadedMaterial renderer for ShadedMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene so meshes with ShadedMaterials
// draw. Enable the built-in modifiers separately with registerBuiltInGlModifierSnippets — a plain
// ShadedMaterial needs only this registration.
export function registerShadedGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, ShadedMaterialKind, shadedGlMeshMaterialRenderer);
}

// Iterates the ordered modifier stack and uploads each modifier's uniforms through its registered GL
// snippet, in the SAME order the compile path emitted them, so a snippet's suffixed uniform names
// (u_..._<index>) line up with the compiled program. A shared texture-unit cursor hands successive
// units (from MODIFIER_TEXTURE_UNIT_BASE) to snippets that sample maps. A modifier whose kind has no
// registered snippet, or a snippet with no `bind`, is skipped (it contributed no GLSL either).
function bindGlShadedModifiers(
  state: GlRenderState,
  program: Readonly<GlShadedProgram>,
  modifiers: readonly Modifier[],
): void {
  const registry: Readonly<ModifierRegistry> | null = getGlSceneRuntime(state).modifierSnippetRegistry;
  if (registry === null) return;
  const ordered = orderModifierStack(modifiers);
  let nextTextureUnit = MODIFIER_TEXTURE_UNIT_BASE;
  const context: GlModifierBindContext = {
    // Hand out modifier units in [BASE, LIMIT); return -1 once exhausted so an over-textured stack
    // drops its excess samplers (bindGlModifierTexture leaves them unbound) instead of walking into
    // the shadow/IBL units and corrupting shadow sampling.
    acquireModifierTextureUnit: () => (nextTextureUnit < MODIFIER_TEXTURE_UNIT_LIMIT ? nextTextureUnit++ : -1),
    index: 0,
    program: program.program,
    state,
  };
  for (let index = 0; index < ordered.length; index++) {
    const modifier = ordered[index];
    const snippet = resolveModifier(registry, modifier.kind) as GlModifierSnippet | null;
    if (snippet === null || snippet.bind === undefined) continue;
    context.index = index;
    snippet.bind(modifier, context);
  }
}

function bindGlShadedMaterialUniforms(
  state: GlRenderState,
  program: Readonly<GlShadedProgram>,
  material: Readonly<ShadedMaterial> | null,
): void {
  const gl = state.gl;
  if (material === null) {
    gl.uniform4f(program.locDiffuse, 1, 1, 1, 1);
    gl.uniform4f(program.locSpecular, 1, 1, 1, 1);
    gl.uniform1f(program.locShininess, 32);
    gl.uniform1f(program.locNormalScale, 1);
    gl.uniform1f(program.locAlphaCutoff, 0.5);
    return;
  }

  unpackColorToLinear(scratchRgba, material.diffuse);
  gl.uniform4f(program.locDiffuse, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  unpackColorToLinear(scratchRgba, material.specular);
  gl.uniform4f(program.locSpecular, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  gl.uniform1f(program.locShininess, material.shininess);
  gl.uniform1f(program.locNormalScale, material.normalScale);
  gl.uniform1f(program.locAlphaCutoff, material.alphaCutoff);

  const diffuseMap = material.diffuseMap;
  if (diffuseMap !== null && diffuseMap.image !== null && hasImageResourcePixels(diffuseMap.image)) {
    gl.activeTexture(gl.TEXTURE0);
    bindGlImageResourceTexture(state, diffuseMap.image, diffuseMap.sampler);
    gl.uniform1i(program.locDiffuseMap, 0);
  }

  const specularMap = material.specularMap;
  if (specularMap !== null && specularMap.image !== null && hasImageResourcePixels(specularMap.image)) {
    gl.activeTexture(gl.TEXTURE1);
    bindGlImageResourceTexture(state, specularMap.image, specularMap.sampler);
    gl.uniform1i(program.locSpecularMap, 1);
  }

  const normalMap = material.normalMap;
  if (normalMap !== null && normalMap.image !== null && hasImageResourcePixels(normalMap.image)) {
    gl.activeTexture(gl.TEXTURE2);
    bindGlImageResourceTexture(state, normalMap.image, normalMap.sampler);
    gl.uniform1i(program.locNormalMap, 2);
  }

  bindGlUvTransform(gl, program, diffuseMap);
}

// The base-material feature flags for a ShadedMaterial: which optional maps are present and whether
// alpha-mask cutoff is active. The modifier feature-set is keyed separately (in ensureGlShadedProgram)
// from the material's modifier stack.
function defineKeyForMaterial(material: Readonly<ShadedMaterial> | null): GlShadedDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasDiffuseMap: material !== null && material.diffuseMap !== null && material.diffuseMap.image !== null,
    hasNormalMap: material !== null && material.normalMap !== null && material.normalMap.image !== null,
    hasSpecularMap: material !== null && material.specularMap !== null && material.specularMap.image !== null,
    hasUvTransform: hasGlUvTransform(material !== null ? material.diffuseMap : null),
  };
}

// Modifier textures bind above the base material units (diffuse/specular/normal on 0/1/2) and below
// the shadow map (unit 8) and IBL units (9/10/11), so a modifier's map never clobbers a base or
// shadow binding. LIMIT mirrors glLitProgram's SHADOW_MAP_TEXTURE_UNIT (8): units [3, 8) are the
// five modifier-sampler slots; a stack asking for more gets -1 (dropped) rather than unit 8+.
const MODIFIER_TEXTURE_UNIT_BASE = 3;
const MODIFIER_TEXTURE_UNIT_LIMIT = 8;
const EMPTY_MODIFIERS: readonly Modifier[] = [];
const scratchRgba: LinearColor = [0, 0, 0, 0];
