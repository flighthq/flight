import type { ExternalTexture, RenderTexture } from '@flighthq/render/contract';
import type {
  EntityRuntime,
  GlColorAdjustmentResources,
  GlParticleResources,
  GlQuadBatchResources,
  GlShapeMeshResources,
  ImageResource,
  TextureSource,
} from '@flighthq/types/contract';

import type { GlBlendSignature, GlBoundShader } from './glRenderStateTypes.ts';
import type { GlRenderTextureEntry } from './glRenderTextureTypes.ts';
import type { GlTextureRealization } from './glTextureResolverTypes.ts';
import type { GlContext } from './types.ts';

// Shared GPU state for one WebGL context, stored as the Entity runtime of a GlContextState. Wraps
// the acquired GlContext and owns the binding shadow, compiled shader programs, texture upload
// caches, shared GPU buffers, and extension queries. Every GlRenderState over the same context
// shares this object via a visible `context` reference. Owner-keyed resource substates (particle,
// quad-batch, color-adjustment, shape-mesh) are nullable and lazily allocated by the subsystem
// that owns them.
export interface GlContextRuntime extends EntityRuntime {
  readonly gl: GlContext;
  references: number;
  teardowns: Array<(gl: GlContext) => void>;

  // Binding shadow — the context-wide binding state tracked to skip redundant GL calls.
  currentBlendSignature: GlBlendSignature | null;
  currentShader: GlBoundShader | null;
  currentTextureRealization: GlTextureRealization | null;

  // Shared GPU buffers allocated once per context.
  quadIndexBuffer: WebGLBuffer;
  quadVertexBuffer: WebGLBuffer;

  // Texture upload caches keyed by source identity, shared across all render states on this context.
  textureCache: WeakMap<CanvasImageSource, WebGLTexture>;
  textureSourcePremultipliedTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  textureSourcePremultipliedSrgbTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  textureSourceStraightTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  textureSourceStraightSrgbTextureCache: WeakMap<TextureSource, { texture: WebGLTexture; version: number }>;
  glExternalTextureCache?: WeakMap<ExternalTexture, WebGLTexture>;
  glRenderTextureCache?: WeakMap<RenderTexture, GlRenderTextureEntry>;
  videoTextureCache?: WeakMap<ImageResource, { texture: WebGLTexture; uploadedVersion: number }>;
  videoSrgbTextureCache?: WeakMap<ImageResource, { texture: WebGLTexture; uploadedVersion: number }>;
  mipmappedTextures?: WeakSet<WebGLTexture>;

  // Extension queries resolved lazily on the first anisotropic bind.
  anisotropyExt?: EXT_texture_filter_anisotropic | null;
  maxAnisotropy?: number;

  // 3D mesh geometry upload cache keyed by the geometry entity.
  sceneMeshUploadCache?: WeakMap<object, object> | null;

  // Owner-keyed resource substates, lazily allocated by the subsystem that owns them.
  colorAdjustmentResources: GlColorAdjustmentResources | null;
  particleResources: GlParticleResources | null;
  quadBatchResources: GlQuadBatchResources | null;
  shapeMeshResources: GlShapeMeshResources | null;
}
