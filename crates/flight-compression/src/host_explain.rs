//! Host capability explanations for the capability groups this crate owns (`compress`,
//! `decompress`), redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each
//! explainer appends to a caller-owned explanation, so a host provider composes its own host's
//! explanation; there is no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::{HostCompressCapabilities, HostDecompressCapabilities};

/// Appends the `compress` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.compress`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the compress group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_compress_capabilities(
    out: &mut HostExplanation,
    compress: &HostCompressCapabilities,
) {
    let mut slots = Vec::new();
    if compress.deflate.is_some() {
        slots.push("deflate".to_string());
    }
    if compress.lzma.is_some() {
        slots.push("lzma".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "compress".to_string(),
        slots,
    });
}

/// Appends the `decompress` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.decompress`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the decompress group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_decompress_capabilities(
    out: &mut HostExplanation,
    decompress: &HostDecompressCapabilities,
) {
    let mut slots = Vec::new();
    if decompress.brotli.is_some() {
        slots.push("brotli".to_string());
    }
    if decompress.deflate.is_some() {
        slots.push("deflate".to_string());
    }
    if decompress.lzma.is_some() {
        slots.push("lzma".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "decompress".to_string(),
        slots,
    });
}
