export type WebGPURenderTarget = {
  bindGroup: GPUBindGroup;
  depthStencilTexture: GPUTexture;
  depthStencilView: GPUTextureView;
  // The color texture's GPU format. Defaults to the canvas format; an HDR effect target uses
  // 'rgba16float'. The pool matches reusable targets on this so an 8-bit and an HDR target never alias.
  format: GPUTextureFormat;
  height: number;
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
};

// A free-list of reusable targets. The effect pipeline owns one and lends intermediate targets to
// multi-pass recipes via acquireWebGPURenderTarget / releaseWebGPURenderTarget.
export type WebGPURenderTargetPool = {
  free: WebGPURenderTarget[];
};
