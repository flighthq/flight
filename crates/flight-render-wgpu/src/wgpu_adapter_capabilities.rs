// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Adapter capability query (TS `wgpuAdapterCapabilities.ts`).

use crate::types::WgpuAdapterCapabilities;

/// Reads the capabilities that gate format and feature paths from an adapter, before any device
/// is requested (TS `getWgpuAdapterCapabilities`). WebGPU exposes no per-format sample counts, and
/// every conformant implementation supports four, so four is reported as the safe maximum.
pub fn get_wgpu_adapter_capabilities(adapter: &wgpu::Adapter) -> WgpuAdapterCapabilities {
    let features = adapter.features();
    let limits = adapter.limits();
    return WgpuAdapterCapabilities {
        max_sample_count: 4,
        max_texture_dimension_2d: limits.max_texture_dimension_2d,
        supports_float32_filterable: features.contains(wgpu::Features::FLOAT32_FILTERABLE),
        supports_timestamp_query: features.contains(wgpu::Features::TIMESTAMP_QUERY),
    };
}
