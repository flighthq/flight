import type { Camera3D } from '@flighthq/camera/contract';
import type { Effect } from '@flighthq/effects/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Scene3DLightsLike } from '@flighthq/lighting/contract';
import type { PbrExtension, PbrUvSet } from '@flighthq/materials/contract';
import type { Viewport } from '@flighthq/node/contract';
import type { RenderProxy2D } from '@flighthq/render/contract';
import type { Node3D } from '@flighthq/scene3d/contract';
import type { Texture } from '@flighthq/texture/contract';
import type { VelocityField } from '@flighthq/velocity/contract';

import type {
  GlColorScaleBiasInstancedShader,
  GlParticleShader,
  GlQuadBatchShader,
  GlRenderState,
  GlShapeMeshColorScaleBiasShader,
  GlUniformColorScaleBiasShader,
} from './glRenderStateTypes.ts';
import type { GlTextureRenderTarget, GlTextureRenderTargetPool } from './glRenderTargetTypes.ts';
import type { GlContext } from './types.ts';

interface GlOwnerEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface GlCompressedTextureSupport {
  readonly astc: boolean;
  readonly bptc: boolean;
  readonly etc: boolean;
  readonly pvrtc: boolean;
  readonly rgtc: boolean;
  readonly s3tc: boolean;
}

export interface GlEffectContext {
  readonly state: GlRenderState;
  readonly source: Readonly<GlTextureRenderTarget>;
  readonly dest: Readonly<GlTextureRenderTarget>;
  readonly pool: GlTextureRenderTargetPool;
  readonly sceneDepthTexture: WebGLTexture | null;
  readonly sceneVelocityTexture: WebGLTexture | null;
}

export type GlEffectRunner = (context: Readonly<GlEffectContext>, effect: Readonly<Effect>) => void;
export type GlEffectResolver = (state: GlRenderState, effect: Readonly<Effect>) => boolean;

export interface GlEffectRegistration {
  readonly isResolvable?: GlEffectResolver;
  readonly runner: GlEffectRunner;
}

export interface GlFullscreenProgram {
  readonly program: WebGLProgram;
  readonly locPosition: number;
  readonly locTexCoord: number;
  readonly texture: WebGLUniformLocation;
  readonly textures: ReadonlyArray<WebGLUniformLocation>;
}

export type GlScene3DPass = (
  state: GlRenderState,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
) => void;

export interface GlShader {
  readonly program: WebGLProgram;
  bind(gl: GlContext, state: GlRenderState, renderProxy: RenderProxy2D): void;
}

export interface GlShaderLocations {
  program: WebGLProgram;
  locPosition: number;
  locTexCoord: number;
  locMatrix: WebGLUniformLocation;
  locAlpha: WebGLUniformLocation;
  locColorScale?: WebGLUniformLocation;
  locColorBias?: WebGLUniformLocation;
  locHasColorScaleBias?: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export type GlBitmapShader = GlOwnerEntity & GlShader & { readonly locations: GlShaderLocations };

export interface GlShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  color: number;
  alpha: number;
}

export interface GlShapeMeshBinding {
  program: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  positionLocation: number;
  matrixLocation: WebGLUniformLocation | null;
  colorLocation: WebGLUniformLocation | null;
}

export interface GlSkinPaletteTexture extends GlOwnerEntity {
  jointCapacity: number;
  texture: WebGLTexture;
}

export interface GlRenderViewResources extends GlOwnerEntity {
  readonly renderState: GlRenderState;
  readonly renderTarget: GlTextureRenderTarget;
  readonly viewport: Viewport;
}

export interface GlVelocityContext {
  readonly state: GlRenderState;
  readonly field: VelocityField;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export type GlVelocityWriter = (context: Readonly<GlVelocityContext>, node: object) => void;

export interface GlColorAdjustmentResources {
  matrixInstancedShader: GlColorScaleBiasInstancedShader;
  scaleBiasInstancedShader: GlColorScaleBiasInstancedShader;
  tintInstancedShader: GlColorScaleBiasInstancedShader;
  uniformScaleBiasShader: GlUniformColorScaleBiasShader;
}

export interface GlParticleResources {
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  shader: GlParticleShader;
}

export interface GlQuadBatchResources {
  cornerBuffer: WebGLBuffer;
  shader: GlQuadBatchShader;
  writerColorScaleBiasBuffer: WebGLBuffer | null;
  writerInstanceBuffer: WebGLBuffer | null;
  writerMaterialBuffer: WebGLBuffer | null;
}

export interface GlShapeMeshResources {
  binding: GlShapeMeshBinding;
  colorMatrixShader: GlShapeMeshColorScaleBiasShader | null;
  colorScaleBiasShader: GlShapeMeshColorScaleBiasShader | null;
}

export interface GlPbrExtensionBindContext {
  bindTransmissionSceneColor(samplerUniform: string, maxLodUniform: string): boolean;
  bindTexture(
    samplerUniform: string,
    uvSetUniform: string,
    uvTransformUniform: string,
    texture: Readonly<Texture> | null,
    uvSet: PbrUvSet,
  ): boolean;
  setLinearColor(uniform: string, color: number): void;
  setFloat(uniform: string, value: number): void;
}

export interface GlPbrExtensionShaderContext {
  hasTransmissionSceneColor(): boolean;
  isTextureReady(texture: Readonly<Texture> | null): boolean;
}

export interface GlPbrExtensionShaderContribution {
  applySurface: string;
  contributeIbl: string;
  contributePunctual: string;
  finalize: string;
  fragmentDeclarations: string;
  fragmentFunctions: string;
  key: string;
  samplesTransmissionSceneColor?: boolean;
  textureCount: number;
}

export interface GlPbrExtensionRegistration {
  bind(context: GlPbrExtensionBindContext, extension: Readonly<PbrExtension>): void;
  createShaderContribution(
    context: Readonly<GlPbrExtensionShaderContext>,
    extension: Readonly<PbrExtension>,
  ): GlPbrExtensionShaderContribution;
  isSupported(extension: Readonly<PbrExtension>): boolean;
}
