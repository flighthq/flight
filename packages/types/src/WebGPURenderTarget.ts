export type WebGPURenderTarget = {
  depthStencilTexture: GPUTexture;
  depthStencilView: GPUTextureView;
  height: number;
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
};
