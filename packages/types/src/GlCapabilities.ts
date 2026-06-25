export interface GlCapabilities {
  maxTextureSize: number;
  maxTextureUnits: number;
  maxSamples: number;
  maxDrawBuffers: number;
  maxColorAttachments: number;
  maxRenderbufferSize: number;
  supportsColorBufferFloat: boolean;
  supportsFloatLinear: boolean;
  supportsSrgb: boolean;
  maxAnisotropy: number;
}
