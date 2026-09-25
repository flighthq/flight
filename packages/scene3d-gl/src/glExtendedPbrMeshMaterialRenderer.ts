import type { ExtendedPbrMaterial, GlMeshMaterialRenderer, GlRenderState } from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind } from '@flighthq/types/contract';

import { bindGlMeshLightBlock } from './glLitProgram.ts';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry.ts';
import {
  beginGlMeshDraw,
  drawGlMeshSubset,
  setGlMeshCameraPosition,
  setGlMeshViewProjection,
} from './glMeshProgram.ts';
import { bindGlPbrExtensions, resolveGlPbrExtensionContributions } from './glPbrExtensionRegistry.ts';
import { ensureGlPbrProgram } from './glPbrProgramCache.ts';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock.ts';
import { getGlScene3DRuntime } from './glScene3DRuntime.ts';

export const glExtendedPbrMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(state, material, lights, camera): void {
    const extended = material as Readonly<ExtendedPbrMaterial> | null;
    const runtime = getGlScene3DRuntime(state);
    const extensions = extended?.extensions ?? [];
    const contributions = resolveGlPbrExtensionContributions(state, extensions);
    if (contributions === null) {
      runtime.pbrExtensionGuard?.(extensions);
      runtime.activeMeshProgram = null;
      return;
    }
    const program = ensureGlPbrProgram(
      state,
      buildGlPbrStandardDefineKey(state, extended?.standard ?? null, extended),
      contributions,
    );
    beginGlMeshDraw(state, program, extended?.doubleSided ?? false);
    setGlMeshViewProjection(state, program.locViewProjection, camera);
    setGlMeshCameraPosition(state.gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPbrStandardBlock(state, program, extended?.standard ?? null);
    state.gl.uniform1f(program.locAlphaCutoff, extended?.alphaCutoff ?? 0.5);
    bindGlPbrExtensions(state, program.program, extensions);
  },
  draw(state, proxy, geometry): void {
    const program = getGlScene3DRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

export function registerGlExtendedPbrMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, ExtendedPbrMaterialKind, glExtendedPbrMeshMaterialRenderer);
}
