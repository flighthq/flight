export type WebGPURenderTarget = {
  bindGroup: GPUBindGroup;
  depthStencilTexture: GPUTexture;
  depthStencilView: GPUTextureView;
  height: number;
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
};
