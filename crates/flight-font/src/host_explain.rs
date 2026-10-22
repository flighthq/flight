//! Host capability explanations for the capability groups this crate owns (`font`, `glyph`),
//! redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each explainer appends
//! to a caller-owned explanation, so a host provider composes its own host's explanation; there is
//! no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::{HostFontCapabilities, HostGlyphCapabilities};

/// Appends the `font` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`loader`), to a host explanation (TS `explainHost` over `host.font`). A
/// host provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the font group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_font_capabilities(out: &mut HostExplanation, font: &HostFontCapabilities) {
    let mut slots = Vec::new();
    if font.loader.is_some() {
        slots.push("loader".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "font".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostFontLoadingCapability".to_string(),
        group: "font".to_string(),
        is_present: font.loader.is_some(),
        slot: "loader".to_string(),
    });
}

/// Appends the `glyph` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`rasterizer`), to a host explanation (TS `explainHost` over `host.glyph`).
/// A host provider composes its host's explanation by calling each group's explainer in group
/// order.
// flight-lint: allow(conform-extra) D26: the glyph group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_glyph_capabilities(out: &mut HostExplanation, glyph: &HostGlyphCapabilities) {
    let mut slots = Vec::new();
    if glyph.rasterizer.is_some() {
        slots.push("rasterizer".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "glyph".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostGlyphRasterizerCapability".to_string(),
        group: "glyph".to_string(),
        is_present: glyph.rasterizer.is_some(),
        slot: "rasterizer".to_string(),
    });
}
