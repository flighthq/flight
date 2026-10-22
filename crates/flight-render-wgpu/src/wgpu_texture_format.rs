// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! The WebGPU texture-format names host contracts carry (TS `GPUTextureFormat` strings) and the
//! native `wgpu` formats render-wgpu allocates with.

/// The native format for a WebGPU format name, or `None` for a name this backend does not use.
// flight-lint: allow(conform-extra) D17: the GPUTextureFormat string vocabulary of the host contracts mapped to native wgpu formats
pub fn get_wgpu_texture_format(name: &str) -> Option<wgpu::TextureFormat> {
    return match name {
        "bgra8unorm" => Some(wgpu::TextureFormat::Bgra8Unorm),
        "bgra8unorm-srgb" => Some(wgpu::TextureFormat::Bgra8UnormSrgb),
        "rgba8unorm" => Some(wgpu::TextureFormat::Rgba8Unorm),
        "rgba8unorm-srgb" => Some(wgpu::TextureFormat::Rgba8UnormSrgb),
        "rgba16float" => Some(wgpu::TextureFormat::Rgba16Float),
        "rgba32float" => Some(wgpu::TextureFormat::Rgba32Float),
        "depth24plus-stencil8" => Some(wgpu::TextureFormat::Depth24PlusStencil8),
        _ => None,
    };
}

/// The WebGPU format name of a native format this backend presents or allocates.
// flight-lint: allow(conform-extra) D17: the native wgpu format mapped back to the GPUTextureFormat string vocabulary of the host contracts
pub fn get_wgpu_texture_format_name(format: wgpu::TextureFormat) -> &'static str {
    return match format {
        wgpu::TextureFormat::Bgra8Unorm => "bgra8unorm",
        wgpu::TextureFormat::Bgra8UnormSrgb => "bgra8unorm-srgb",
        wgpu::TextureFormat::Rgba8Unorm => "rgba8unorm",
        wgpu::TextureFormat::Rgba8UnormSrgb => "rgba8unorm-srgb",
        wgpu::TextureFormat::Rgba16Float => "rgba16float",
        wgpu::TextureFormat::Rgba32Float => "rgba32float",
        wgpu::TextureFormat::Depth24PlusStencil8 => "depth24plus-stencil8",
        _ => "unknown",
    };
}
