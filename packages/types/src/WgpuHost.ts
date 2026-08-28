export interface WgpuHostAcquisition {
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  // Caller ownership borrows all three handles. Flight ownership transfers their teardown to the
  // acquiring backend after the last render state sharing this acquisition is destroyed.
  readonly ownership: 'caller' | 'flight';
}

export interface WgpuHostAcquisitionOptions {
  readonly format?: GPUTextureFormat;
  readonly powerPreference?: GPUPowerPreference;
}

// Process-wide host seam for acquiring a WebGPU device and presentation context. A native host may
// return its own structurally compatible handles without coupling render-wgpu to Application or a
// host runtime. release is called for both ownership modes; the backend must detach caller-owned
// acquisitions without destroying their handles and destroy Flight-owned handles exactly once.
export interface WgpuHostBackend {
  acquire(canvas: HTMLCanvasElement, options: Readonly<WgpuHostAcquisitionOptions>): Promise<WgpuHostAcquisition>;
  isSupported(): boolean;
  release(acquisition: Readonly<WgpuHostAcquisition>): void;
}
