import type { ExternalTexture } from './ExternalTexture';
import type { GlColorAdjustmentResources } from './GlColorAdjustmentResources';
import type { GlContext } from './GlContext';
import type { GlParticleResources } from './GlParticleResources';
import type { GlQuadBatchResources } from './GlQuadBatchResources';
import type { GlBlendSignature, GlBoundShader } from './GlRenderState';
import type { GlRenderTextureEntry } from './GlRenderTexture';
import type { GlShapeMeshResources } from './GlShapeMeshResources';
import type { GlTextureRealization } from './GlTextureResolver';
import type { Image } from './Image';
import type { RenderTexture } from './RenderTexture';
import type { TextureSource } from './TextureSource';

// Shared GPU state for one WebGL context. Wraps the acquired GlContext and owns the binding shadow,
// compiled shader programs, texture upload caches, shared GPU buffers, and extension queries. Every
// GlRenderState over the same context shares this object via a visible `context` reference — no
// defineProperty, no WeakMap. Owner-keyed resource substates (particle, quad-batch, color-adjustment,
// shape-mesh) are nullable and lazily allocated by the subsystem that owns them.
export interface GlContextRuntime {
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
  videoTextureCache?: WeakMap<Image, { texture: WebGLTexture; uploadedVersion: number }>;
  videoSrgbTextureCache?: WeakMap<Image, { texture: WebGLTexture; uploadedVersion: number }>;
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
