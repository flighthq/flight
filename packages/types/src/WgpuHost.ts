export interface WgpuHostAcquisition {
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  /**
   * `flight` identifies handles created for Flight; `caller` identifies exact borrowed handles. The
   * canonical lifecycle and ownership contract is recorded in `agents/backend-lifecycle-ownership.md`.
   */
  readonly ownership: 'caller' | 'flight';
}

export interface WgpuHostAcquisitionOptions {
  readonly format?: GPUTextureFormat;
  readonly powerPreference?: GPUPowerPreference;
}

// Process-wide host seam for acquiring a WebGPU device and presentation context. A native host may
// return its own structurally compatible handles without coupling render-wgpu to Application or a
// host runtime. Its canonical lifecycle and ownership contract is recorded in
// agents/backend-lifecycle-ownership.md.
export interface WgpuHostBackend {
  acquire(canvas: HTMLCanvasElement, options: Readonly<WgpuHostAcquisitionOptions>): Promise<WgpuHostAcquisition>;
  isSupported(): boolean;
  release(acquisition: Readonly<WgpuHostAcquisition>): void;
}
