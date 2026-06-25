//! wgpu material renderer registry — maps material `KindId` to a renderer.

use flighthq_types::kind::KindId;
use flighthq_types::material::DefaultMaterialKind;

use crate::render_state::WgpuRenderState;

/// Trait for a renderer that handles a specific material kind in the wgpu batch.
pub trait WgpuMaterialRenderer: Send + Sync {
    /// Number of per-instance floats this material writes. `0` for uniforms-only.
    fn instance_float_count(&self) -> u32;
    /// Selects, binds, and configures the pipeline + uniforms for a flush.
    fn bind(&self, state: &mut WgpuRenderState, material_id: u64);
    /// Packs per-instance material data at `out[offset..]`. Only called when
    /// `instance_float_count() > 0`.
    fn pack_instance(
        &self,
        _state: &mut WgpuRenderState,
        _material_data_id: u64,
        _out: &mut Vec<f32>,
        _offset: usize,
    ) {
    }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the material renderer registered for `kind`, or `None`.
pub fn get_wgpu_material_renderer(
    state: &WgpuRenderState,
    kind: KindId,
) -> Option<&dyn WgpuMaterialRenderer> {
    state
        .runtime
        .material_renderer_map
        .get(&kind)
        .map(|boxed| boxed.as_ref())
}

/// Registers a material renderer for `kind`.
pub fn register_wgpu_material_renderer(
    state: &mut WgpuRenderState,
    kind: KindId,
    renderer: Box<dyn WgpuMaterialRenderer>,
) {
    state.runtime.material_renderer_map.insert(kind, renderer);
}

/// Resolves a node's material to its renderer: by the material's `KindId`,
/// then the `DefaultMaterialKind` renderer, then `None`.
///
/// The render path knows nothing about which materials exist — every material
/// (including the default) enters only through user registration, and an
/// unresolved material is a no-op, never a built-in fallback.
pub fn resolve_wgpu_material_renderer(
    state: &WgpuRenderState,
    material_kind: Option<KindId>,
) -> Option<&dyn WgpuMaterialRenderer> {
    let map = &state.runtime.material_renderer_map;
    if let Some(kind) = material_kind
        && let Some(renderer) = map.get(&kind)
    {
        return Some(renderer.as_ref());
    }
    map.get(&KindId::of::<DefaultMaterialKind>())
        .map(|boxed| boxed.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StubRenderer(u32);
    impl WgpuMaterialRenderer for StubRenderer {
        fn instance_float_count(&self) -> u32 {
            self.0
        }
        fn bind(&self, _state: &mut WgpuRenderState, _material_id: u64) {}
    }

    // A registry map test that does not need a device: we exercise the resolution
    // precedence on a standalone HashMap with the same key semantics.

    #[test]
    fn resolve_precedence_prefers_specific_kind_then_default() {
        let mut map: std::collections::HashMap<KindId, Box<dyn WgpuMaterialRenderer>> =
            std::collections::HashMap::new();
        let specific = KindId::new();
        map.insert(specific, Box::new(StubRenderer(4)));
        map.insert(
            KindId::of::<DefaultMaterialKind>(),
            Box::new(StubRenderer(0)),
        );

        // Specific kind resolves to its own renderer.
        assert_eq!(map.get(&specific).unwrap().instance_float_count(), 4);
        // Default-kind lookup resolves to the default renderer.
        assert_eq!(
            map.get(&KindId::of::<DefaultMaterialKind>())
                .unwrap()
                .instance_float_count(),
            0
        );
    }

    #[test]
    fn resolve_missing_specific_falls_back_to_default() {
        let mut map: std::collections::HashMap<KindId, Box<dyn WgpuMaterialRenderer>> =
            std::collections::HashMap::new();
        map.insert(
            KindId::of::<DefaultMaterialKind>(),
            Box::new(StubRenderer(2)),
        );
        let unknown = KindId::new();
        let resolved = map
            .get(&unknown)
            .or_else(|| map.get(&KindId::of::<DefaultMaterialKind>()));
        assert!(resolved.is_some());
        assert_eq!(resolved.unwrap().instance_float_count(), 2);
    }
}
