export type WgpuRenderTarget = {
  bindGroup: GPUBindGroup;
  depthStencilTexture: GPUTexture;
  depthStencilView: GPUTextureView;
  // The color texture's GPU format. Defaults to the canvas format; an HDR effect target uses
  // 'rgba16float'. The pool matches reusable targets on this so an 8-bit and an HDR target never alias.
  format: GPUTextureFormat;
  height: number;
  // Clear policy resolved from creation: packed-RGBA (0xRRGGBBAA) per color attachment (empty == a
  // transparent clear, the render-target default) and the depth clear value. Read by beginWgpuRenderPass
  // to build the pass load op; fixed per target, since only the clear-or-keep choice varies per pass.
  clearColors: number[];
  clearDepth: number;
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
};

// A free-list of reusable targets. The effect pipeline owns one and lends intermediate targets to
// multi-pass recipes via acquireWgpuRenderTarget / releaseWgpuRenderTarget.
export type WgpuRenderTargetPool = {
  free: WgpuRenderTarget[];
};
