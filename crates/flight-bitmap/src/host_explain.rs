//! Host capability explanations for the capability group this crate owns (`bitmap`), redistributed
//! from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends to a
//! caller-owned explanation, so a host provider composes its own host's explanation; there is no
//! aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::HostBitmapCapabilities;

/// Appends the `bitmap` group and its filled slot names, in source property order, and the presence
/// of its covered slots (`encode`, `readback`), to a host explanation (TS `explainHost` over
/// `host.bitmap`). A host provider composes its host's explanation by calling each group's
/// explainer in group order.
// flight-lint: allow(conform-extra) D26: the bitmap group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_bitmap_capabilities(
    out: &mut HostExplanation,
    bitmap: &HostBitmapCapabilities,
) {
    let mut slots = Vec::new();
    if bitmap.encode.is_some() {
        slots.push("encode".to_string());
    }
    if bitmap.readback.is_some() {
        slots.push("readback".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "bitmap".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostBitmapEncodeCapability".to_string(),
        group: "bitmap".to_string(),
        is_present: bitmap.encode.is_some(),
        slot: "encode".to_string(),
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostBitmapReadbackCapability".to_string(),
        group: "bitmap".to_string(),
        is_present: bitmap.readback.is_some(),
        slot: "readback".to_string(),
    });
}
