//! wgpu adapter capabilities — the read-only capability probe consulted at
//! configuration time, before a device is created.
//!
//! Ports the TS `@flighthq/render-wgpu/wgpuAdapterCapabilities` helper. Query
//! this after requesting an adapter but before creating the render state so the
//! state (and the device's `required_features`) can be configured correctly.

/// Capabilities probed from a `wgpu::Adapter` that gate the format and feature
/// paths a render state selects. Mirrors the TS `WgpuAdapterCapabilities`.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct WgpuAdapterCapabilities {
    /// Maximum MSAA sample count reported as safe for antialias paths.
    pub max_sample_count: u32,
    /// Largest 2D texture edge the adapter supports.
    pub max_texture_dimension_2d: u32,
    /// `float32-filterable`: rgba16float render targets with linear filtering (HDR).
    pub supports_float32_filterable: bool,
    /// `timestamp-query`: GPU time measurement.
    pub supports_timestamp_query: bool,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Queries `adapter` for the capabilities `create_wgpu_render_state` uses to
/// gate format and feature paths.
///
/// The adapter is read-only here — no device is created — so capabilities are
/// known before the device is requested with the right `required_features`.
pub fn get_wgpu_adapter_capabilities(adapter: &wgpu::Adapter) -> WgpuAdapterCapabilities {
    let features = adapter.features();
    let limits = adapter.limits();
    build_wgpu_adapter_capabilities(
        features.contains(wgpu::Features::FLOAT32_FILTERABLE),
        features.contains(wgpu::Features::TIMESTAMP_QUERY),
        limits.max_texture_dimension_2d,
    )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// WebGPU does not expose supported MSAA sample counts per format via the adapter.
// All conformant implementations support sampleCount 4 for standard formats; 8+
// is implementation-defined. Report 4 as the safe maximum for antialias paths.
const WGPU_MAX_SAMPLE_COUNT: u32 = 4;

// Assembles the caps struct from the resolved feature flags and texture limit.
// Split out from `get_wgpu_adapter_capabilities` so the assembly is testable
// without a live adapter.
fn build_wgpu_adapter_capabilities(
    supports_float32_filterable: bool,
    supports_timestamp_query: bool,
    max_texture_dimension_2d: u32,
) -> WgpuAdapterCapabilities {
    WgpuAdapterCapabilities {
        max_sample_count: WGPU_MAX_SAMPLE_COUNT,
        max_texture_dimension_2d,
        supports_float32_filterable,
        supports_timestamp_query,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // build_wgpu_adapter_capabilities

    #[test]
    fn float32_filterable_reflects_the_flag() {
        assert!(!build_wgpu_adapter_capabilities(false, false, 8192).supports_float32_filterable);
        assert!(build_wgpu_adapter_capabilities(true, false, 8192).supports_float32_filterable);
    }

    #[test]
    fn timestamp_query_reflects_the_flag() {
        assert!(!build_wgpu_adapter_capabilities(false, false, 8192).supports_timestamp_query);
        assert!(build_wgpu_adapter_capabilities(false, true, 8192).supports_timestamp_query);
    }

    #[test]
    fn max_texture_dimension_passes_through() {
        assert_eq!(
            build_wgpu_adapter_capabilities(false, false, 16384).max_texture_dimension_2d,
            16384
        );
    }

    #[test]
    fn max_sample_count_is_four() {
        assert_eq!(
            build_wgpu_adapter_capabilities(false, false, 8192).max_sample_count,
            4
        );
    }
}
