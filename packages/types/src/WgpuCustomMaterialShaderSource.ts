// A complete WGSL module registered for a CustomShaderMaterial on the WebGPU backend.
//
// The module owns its vertex and fragment entry points, but uses scene-wgpu's fixed mesh ABI:
// group(0)/binding(0) is Frame, group(1)/binding(0) is Draw, group(2)/binding(0) is the
// caller-authored UserBlock, and group(3) contains sampler/texture pairs. See
// registerWgpuCustomMaterialShader for the exact struct and packing contract.
export type WgpuCustomMaterialShaderSource = string;
