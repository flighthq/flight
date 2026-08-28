export interface WgpuHostAcquisition {
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  /**
   * `flight` is valid only when the backend created these handles for Flight during `acquire`; the
   * backend receives their teardown after the last render state sharing the acquisition is destroyed.
   *
   * `caller` means every handle is borrowed with its exact identity. Flight still reports the release
   * to the originating backend, but neither Flight nor that backend may destroy the device or
   * unconfigure/destroy the presentation context or native surface. Those handles may serve resources
   * outside Flight, so render-state or backend teardown must leave them usable by their owner.
   */
  readonly ownership: 'caller' | 'flight';
}

export interface WgpuHostAcquisitionOptions {
  readonly format?: GPUTextureFormat;
  readonly powerPreference?: GPUPowerPreference;
}

// Process-wide host seam for acquiring a WebGPU device and presentation context. A native host may
// return its own structurally compatible handles without coupling render-wgpu to Application or a
// host runtime. release is called for both ownership modes. It destroys a Flight-created acquisition
// exactly once and only detaches a caller-owned acquisition, preserving every borrowed native handle.
export interface WgpuHostBackend {
  acquire(canvas: HTMLCanvasElement, options: Readonly<WgpuHostAcquisitionOptions>): Promise<WgpuHostAcquisition>;
  isSupported(): boolean;
  release(acquisition: Readonly<WgpuHostAcquisition>): void;
}
