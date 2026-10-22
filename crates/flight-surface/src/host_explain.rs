//! Host capability explanations for the capability groups this crate owns (`canvas`, `gl`,
//! `surface`, `wgpu`), redistributed from the former aggregate host (D26; TS `hostExplain.ts`).
//! Each explainer appends to a caller-owned explanation, so a host provider composes its own host's
//! explanation; there is no aggregate.

use flight_host::{HostCapabilityCoverage, HostCapabilityGroupExplanation, HostExplanation};

use crate::{
    HostCanvasCapabilities, HostGlCapabilities, HostSurfaceCapabilities, HostWgpuCapabilities,
};

/// Appends the `canvas` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.canvas`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the canvas group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_canvas_capabilities(
    out: &mut HostExplanation,
    canvas: &HostCanvasCapabilities,
) {
    let mut slots = Vec::new();
    if canvas.context.is_some() {
        slots.push("context".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "canvas".to_string(),
        slots,
    });
}

/// Appends the `gl` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.gl`). A host provider composes its host's explanation
/// by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the gl group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_gl_capabilities(out: &mut HostExplanation, gl: &HostGlCapabilities) {
    let mut slots = Vec::new();
    if gl.context.is_some() {
        slots.push("context".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "gl".to_string(),
        slots,
    });
}

/// Appends the `surface` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.surface`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the surface group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_surface_capabilities(
    out: &mut HostExplanation,
    surface: &HostSurfaceCapabilities,
) {
    let mut slots = Vec::new();
    if surface.display.is_some() {
        slots.push("display".to_string());
    }
    if surface.resize.is_some() {
        slots.push("resize".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "surface".to_string(),
        slots,
    });
}

/// Appends the `wgpu` group and its filled slot names, in source property order, and the presence
/// of its covered slot (`context`), to a host explanation (TS `explainHost` over `host.wgpu`). A
/// host provider composes its host's explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the wgpu group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_wgpu_capabilities(out: &mut HostExplanation, wgpu: &HostWgpuCapabilities) {
    let mut slots = Vec::new();
    if wgpu.context.is_some() {
        slots.push("context".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "wgpu".to_string(),
        slots,
    });
    out.capabilities.push(HostCapabilityCoverage {
        capability: "HostWgpuCapability".to_string(),
        group: "wgpu".to_string(),
        is_present: wgpu.context.is_some(),
        slot: "context".to_string(),
    });
}
