// Fixed WebGPU custom-material ABI capacities. Every logical scalar/vector uniform consumes one
// vec4-aligned slot; every texture consumes sampler(binding 2N) + texture(binding 2N+1) in group(3).
export const WGPU_CUSTOM_SHADER_USER_VEC4_CAPACITY = 32;
export const WGPU_CUSTOM_SHADER_TEXTURE_CAPACITY = 8;
