import { unpackColorToLinear } from '@flighthq/color/contract';
import { createMatrix3 } from '@flighthq/geometry/contract';
import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { getGlRenderStateRuntime, resolveGlTexture } from '@flighthq/render-gl/contract';
import { getTextureUvMatrix } from '@flighthq/texture/contract';
import type {
  GlContext,
  GlPbrExtensionBindContext,
  GlPbrExtensionIssue,
  GlPbrExtensionRegistration,
  GlPbrExtensionShaderContext,
  GlPbrExtensionShaderContribution,
  GlRenderState,
  Kind,
  LinearColor,
  Matrix3,
  PbrExtension,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { isGlTextureReady } from './glPbrStandardBlock';
import { getGlScene3DRuntime } from './glScene3DRuntime';

export function bindGlPbrExtensions(
  state: GlRenderState,
  program: WebGLProgram,
  extensions: readonly PbrExtension[],
): boolean {
  const entries = getGlRenderStateRuntime(state).registries.pbrExtensions.entries;
  const context = createGlPbrExtensionBindContext(state, program);
  for (let i = 0; i < extensions.length; i++) {
    const entry = entries.get(extensions[i].kind);
    if (entry?.state !== RegistryEntryState.Bound) return false;
    entry.value.bind(context, extensions[i]);
  }
  return true;
}

export function explainGlPbrExtensions(
  state: GlRenderState,
  extensions: readonly PbrExtension[],
): readonly GlPbrExtensionIssue[] {
  const issues: GlPbrExtensionIssue[] = [];
  const kinds = new Set<Kind>();
  const entries = getGlRenderStateRuntime(state).registries.pbrExtensions.entries;
  let transmissionSceneColorKind: Kind | null = null;
  let textureCount = 0;
  const shaderContext = createGlPbrExtensionShaderContext(state);
  for (let i = 0; i < extensions.length; i++) {
    const extension = extensions[i];
    if (kinds.has(extension.kind)) {
      issues.push({ code: 'duplicate-kind', kind: extension.kind });
      continue;
    }
    kinds.add(extension.kind);
    const entry = entries.get(extension.kind);
    if (entry?.state !== RegistryEntryState.Bound) {
      issues.push({ code: 'missing-registration', kind: extension.kind });
      continue;
    }
    const registration = entry.value;
    if (!registration.isSupported(extension)) {
      issues.push({ code: 'unsupported-extension', kind: extension.kind });
      continue;
    }
    const contribution = registration.createShaderContribution(shaderContext, extension);
    if (contribution.samplesTransmissionSceneColor === true) transmissionSceneColorKind = extension.kind;
    textureCount += contribution.textureCount;
  }
  const sceneColor = getGlScene3DRuntime(state).pbrTransmissionSceneColor;
  const activeTarget = getGlRenderStateRuntime(state).currentRenderTarget;
  if (
    transmissionSceneColorKind !== null &&
    sceneColor !== null &&
    activeTarget?.textures.includes(sceneColor.texture) === true
  ) {
    issues.push({ code: 'framebuffer-feedback', kind: transmissionSceneColorKind });
  }
  if (textureCount > getGlPbrExtensionTextureUnits(state.gl).length) {
    issues.push({ code: 'texture-unit-exhaustion', kind: 'ExtendedPbrMaterial' });
  }
  return issues;
}

export function getGlPbrExtensionRegistration(state: GlRenderState, kind: Kind): GlPbrExtensionRegistration | null {
  const entry = getGlRenderStateRuntime(state).registries.pbrExtensions.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

export function registerGlPbrExtension(
  state: GlRenderState,
  kind: Kind,
  registration: GlPbrExtensionRegistration,
): void {
  const registries = getGlRenderStateRuntime(state).registries;
  registries.pbrExtensions = withRegistryTableEntry(registries.pbrExtensions, kind, registration);
  registries.pbrExtensionRevision++;
}

export function resolveGlPbrExtensionContributions(
  state: GlRenderState,
  extensions: readonly PbrExtension[],
): readonly GlPbrExtensionShaderContribution[] | null {
  if (explainGlPbrExtensions(state, extensions).length > 0) return null;
  const entries = getGlRenderStateRuntime(state).registries.pbrExtensions.entries;
  const context = createGlPbrExtensionShaderContext(state);
  const contributions: GlPbrExtensionShaderContribution[] = [];
  for (let i = 0; i < extensions.length; i++) {
    const entry = entries.get(extensions[i].kind);
    if (entry?.state !== RegistryEntryState.Bound) return null;
    contributions.push(entry.value.createShaderContribution(context, extensions[i]));
  }
  return contributions;
}

function createGlPbrExtensionShaderContext(state: GlRenderState): GlPbrExtensionShaderContext {
  return {
    hasTransmissionSceneColor(): boolean {
      return getGlScene3DRuntime(state).pbrTransmissionSceneColor !== null;
    },
    isTextureReady(texture): boolean {
      return isGlTextureReady(state, texture);
    },
  };
}

function createGlPbrExtensionBindContext(state: GlRenderState, program: WebGLProgram): GlPbrExtensionBindContext {
  const gl = state.gl;
  const textureUnits = getGlPbrExtensionTextureUnits(gl);
  let textureIndex = 0;
  return {
    bindTransmissionSceneColor(samplerUniform, maxLodUniform): boolean {
      const sceneColor = getGlScene3DRuntime(state).pbrTransmissionSceneColor;
      if (sceneColor === null) return false;
      const unit = textureUnits[textureIndex++];
      if (unit === undefined) return false;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, sceneColor.texture);
      gl.uniform1i(gl.getUniformLocation(program, samplerUniform), unit);
      gl.uniform1f(gl.getUniformLocation(program, maxLodUniform), Math.max(0, sceneColor.mipLevelCount - 1));
      return true;
    },
    bindTexture(samplerUniform, uvSetUniform, uvTransformUniform, texture, uvSet): boolean {
      if (!isGlTextureReady(state, texture)) return false;
      const unit = textureUnits[textureIndex++];
      if (unit === undefined || texture === null) return false;
      gl.activeTexture(gl.TEXTURE0 + unit);
      if (resolveGlTexture(state, texture) === null) return false;
      gl.uniform1i(gl.getUniformLocation(program, samplerUniform), unit);
      gl.uniform1i(gl.getUniformLocation(program, uvSetUniform), uvSet);
      getTextureUvMatrix(scratchUvMatrix, texture);
      gl.uniformMatrix3fv(gl.getUniformLocation(program, uvTransformUniform), false, scratchUvMatrix.m);
      return true;
    },
    setFloat(uniform, value): void {
      gl.uniform1f(gl.getUniformLocation(program, uniform), value);
    },
    setLinearColor(uniform, color): void {
      unpackColorToLinear(scratchRgba, color);
      gl.uniform3f(gl.getUniformLocation(program, uniform), scratchRgba[0], scratchRgba[1], scratchRgba[2]);
    },
  };
}

function getGlPbrExtensionTextureUnits(gl: GlContext): readonly number[] {
  const count = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
  const units: number[] = [];
  for (let unit = 6; unit < count; unit++) {
    if (unit < 8 || unit > 12) units.push(unit);
  }
  return units;
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
const scratchUvMatrix: Matrix3 = createMatrix3();
