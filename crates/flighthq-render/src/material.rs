//! Material update step for the render walk.
//!
//! Resolves a node's material and per-node material data onto the `RenderProxy`.
//! Materials are non-inheriting: a node uses its own material (or none, meaning
//! the default pipeline). Called for every node in the render walk — materials
//! are a core feature, not opt-in.

use flighthq_types::{Material, MaterialData, RenderProxy, RenderState};

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Copies the material and material-data references from the source node onto
/// `data`. Non-inheriting: `parent_data` is accepted for API symmetry but is
/// not consulted.
///
/// `source_material` and `source_material_data` are borrowed from the source
/// node by the caller; this keeps the function side-effect-free and easy to
/// unit-test.
pub fn update_render_proxy_material(
    _state: &RenderState,
    _data: &mut RenderProxy,
    _source_material: Option<&'static dyn Material>,
    _source_material_data: Option<&'static dyn MaterialData>,
    _parent_data: Option<&RenderProxy>,
) {
    // TODO(wave-N): the TS source writes `data.material` / `data.materialData` onto the
    // render proxy, but the Rust `RenderProxy` does not yet carry material slots (they were
    // dropped from the proxy type in the bootstrap stub). Once those fields exist, copy the
    // source's material and material-data references here (non-inheriting; the parent is not
    // consulted). For now this is a no-op so the render walk composes correctly.
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // update_render_proxy_material

    #[test]
    fn update_render_proxy_material_noop_without_material() {
        let state = RenderState::default();
        let mut proxy = RenderProxy::default();
        // With no source material, blend_mode on the proxy should remain unchanged.
        let before_blend = proxy.blend_mode;
        update_render_proxy_material(&state, &mut proxy, None, None, None);
        assert_eq!(proxy.blend_mode, before_blend);
    }
}
