export type GlCullFaceKind = 'Back' | 'Front' | 'FrontAndBack';

export type GlDepthFuncKind =
  | 'Always'
  | 'Equal'
  | 'Greater'
  | 'GreaterEqual'
  | 'Less'
  | 'LessEqual'
  | 'Never'
  | 'NotEqual';

export type GlFramebufferStatusKind =
  | 'Complete'
  | 'IncompleteAttachment'
  | 'IncompleteDimensions'
  | 'IncompleteMissingAttachment'
  | 'IncompleteMultisample'
  | 'Unsupported'
  | 'Unknown';

export interface GlRenderStats {
  drawCalls: number;
  triangles: number;
  textureBinds: number;
  programSwitches: number;
  framebufferBinds: number;
  uniformUploads: number;
}

export interface GlTextureDescriptor {
  readonly wrapS?: GlTextureWrapKind;
  readonly wrapT?: GlTextureWrapKind;
  readonly minFilter?: GlTextureFilterKind;
  readonly magFilter?: GlTextureFilterKind;
  readonly mipmaps?: boolean;
  readonly anisotropy?: number;
  readonly premultiplyAlpha?: boolean;
  readonly format?: GlTextureInternalFormat;
}

export type GlTextureFilterKind =
  | 'Linear'
  | 'LinearMipmapLinear'
  | 'LinearMipmapNearest'
  | 'Nearest'
  | 'NearestMipmapLinear'
  | 'NearestMipmapNearest';

export type GlTextureInternalFormat =
  | 'r8'
  | 'r16f'
  | 'r32f'
  | 'rg8'
  | 'rg16f'
  | 'rgba8'
  | 'rgba16f'
  | 'rgba32f'
  | 'srgb8_alpha8';

export type GlTextureWrapKind = 'ClampToEdge' | 'MirroredRepeat' | 'Repeat';
