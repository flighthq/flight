//! The fixed WebGPU custom-material ABI capacities (TS `wgpuCustomMaterialAbi.ts`). Every logical
//! scalar/vector uniform consumes one vec4-aligned slot; every texture consumes sampler (binding 2N)
//! plus texture (binding 2N+1) in group(3).

/// The UserBlock's vec4 slot capacity (TS `WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY`).
pub const WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY: usize = 32;

/// The custom material's texture binding capacity (TS `WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY`).
pub const WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY: usize = 8;
