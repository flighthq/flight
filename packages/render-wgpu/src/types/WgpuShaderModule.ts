// Opaque: compiled by the device and referenced by pipeline stages, never inspected. On web it is the
// browser's GPUShaderModule; a native host supplies its own handle.
export type WgpuShaderModule = GPUShaderModule;

export interface WgpuShaderModuleDescriptor {
  code: string;
  label?: string;
}
