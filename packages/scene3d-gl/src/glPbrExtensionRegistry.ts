import { unpackColorToLinear } from '@flighthq/color/contract';
import { createMatrix3 } from '@flighthq/geometry/contract';
import { getGlRenderStateRuntime, resolveGlTexture } from '@flighthq/render-gl/contract';
import { getTextureUvMatrix } from '@flighthq/texture/contract';
import type {
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

import { isGlTextureReady } from './glPbrStandardBlock';
import { getGlScene3DRuntime } from './glScene3DRuntime';

export function bindGlPbrExtensions(
  state: GlRenderState,
  program: WebGLProgram,
  extensions: readonly PbrExtension[],
): boolean {
  const registry = getGlScene3DRuntime(state).pbrExtensionRegistry;
  const context = createGlPbrExtensionBindContext(state, program);
  for (let i = 0; i < extensions.length; i++) {
    const registration = registry.get(extensions[i].kind);
    if (registration === undefined) return false;
    registration.bind(context, extensions[i]);
  }
  return true;
}

export function explainGlPbrExtensions(
  state: GlRenderState,
  extensions: readonly PbrExtension[],
): readonly GlPbrExtensionIssue[] {
  const issues: GlPbrExtensionIssue[] = [];
  const kinds = new Set<Kind>();
  const registry = getGlScene3DRuntime(state).pbrExtensionRegistry;
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
    const registration = registry.get(extension.kind);
    if (registration === undefined) {
      issues.push({ code: 'missing-registration', kind: extension.kind });
      continue;
    }
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
  return getGlScene3DRuntime(state).pbrExtensionRegistry.get(kind) ?? null;
}

export function registerGlPbrExtension(
  state: GlRenderState,
  kind: Kind,
  registration: GlPbrExtensionRegistration,
): void {
  const runtime = getGlScene3DRuntime(state);
  runtime.pbrExtensionRegistry.set(kind, registration);
  runtime.pbrExtensionRegistryVersion++;
}

export function resolveGlPbrExtensionContributions(
  state: GlRenderState,
  extensions: readonly PbrExtension[],
): readonly GlPbrExtensionShaderContribution[] | null {
  if (explainGlPbrExtensions(state, extensions).length > 0) return null;
  const registry = getGlScene3DRuntime(state).pbrExtensionRegistry;
  const context = createGlPbrExtensionShaderContext(state);
  const contributions: GlPbrExtensionShaderContribution[] = [];
  for (let i = 0; i < extensions.length; i++) {
    contributions.push(registry.get(extensions[i].kind)!.createShaderContribution(context, extensions[i]));
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

function getGlPbrExtensionTextureUnits(gl: WebGL2RenderingContext): readonly number[] {
  const count = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
  const units: number[] = [];
  for (let unit = 6; unit < count; unit++) {
    if (unit < 8 || unit > 12) units.push(unit);
  }
  return units;
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
const scratchUvMatrix: Matrix3 = createMatrix3();
