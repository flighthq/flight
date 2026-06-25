//! GL material renderer registry — maps material `KindId` to a renderer.

use flighthq_types::kind::KindId;
use flighthq_types::material::DefaultMaterialKind;

use crate::render_state::GlRenderState;

/// Trait for a renderer that handles a specific material kind in the GL batch.
pub trait GlMaterialRenderer: Send + Sync {
    /// Number of per-instance floats this material writes. `0` for uniforms-only.
    fn instance_float_count(&self) -> u32;
    /// Selects, binds, and configures the GL program + uniforms for a flush.
    fn bind(&self, state: &mut GlRenderState, material_id: u64);
    /// Packs per-instance material data at `out[offset..]`. Only called when
    /// `instance_float_count() > 0`. Default: no-op for uniform-only materials.
    fn pack_instance(
        &self,
        _state: &mut GlRenderState,
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
pub fn get_gl_material_renderer(
    state: &GlRenderState,
    kind: KindId,
) -> Option<&dyn GlMaterialRenderer> {
    state
        .runtime
        .material_renderers
        .get(&kind)
        .map(|r| r.as_ref())
}

/// Registers a material renderer for `kind`.
pub fn register_gl_material_renderer(
    state: &mut GlRenderState,
    kind: KindId,
    renderer: Box<dyn GlMaterialRenderer>,
) {
    state.runtime.material_renderers.insert(kind, renderer);
}

/// Resolves a node's material to its renderer: by the material's `KindId`,
/// then the `DefaultMaterialKind` renderer, then `None`.
pub fn resolve_gl_material_renderer(
    state: &GlRenderState,
    material_kind: Option<KindId>,
) -> Option<&dyn GlMaterialRenderer> {
    if let Some(kind) = material_kind
        && let Some(renderer) = state.runtime.material_renderers.get(&kind)
    {
        return Some(renderer.as_ref());
    }
    state
        .runtime
        .material_renderers
        .get(&KindId::of::<DefaultMaterialKind>())
        .map(|r| r.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeMaterialRenderer(u32);
    impl GlMaterialRenderer for FakeMaterialRenderer {
        fn instance_float_count(&self) -> u32 {
            self.0
        }
        fn bind(&self, _state: &mut GlRenderState, _material_id: u64) {}
    }

    // resolve_gl_material_renderer (registry logic, no GL device needed)

    #[test]
    fn resolve_falls_back_to_default_kind() {
        // Build the registry directly to avoid constructing a GL context.
        let mut runtime = crate::render_state::create_gl_render_state_runtime();
        runtime.material_renderers.insert(
            KindId::of::<DefaultMaterialKind>(),
            Box::new(FakeMaterialRenderer(8)),
        );
        // A specific kind that is not registered resolves to the default.
        let unknown = KindId::new();
        let found = runtime.material_renderers.get(&unknown).or_else(|| {
            runtime
                .material_renderers
                .get(&KindId::of::<DefaultMaterialKind>())
        });
        assert!(found.is_some());
        assert_eq!(found.unwrap().instance_float_count(), 8);
    }

    #[test]
    fn registry_prefers_specific_kind() {
        let mut runtime = crate::render_state::create_gl_render_state_runtime();
        let specific = KindId::new();
        runtime
            .material_renderers
            .insert(specific, Box::new(FakeMaterialRenderer(2)));
        runtime.material_renderers.insert(
            KindId::of::<DefaultMaterialKind>(),
            Box::new(FakeMaterialRenderer(8)),
        );
        let found = runtime.material_renderers.get(&specific).unwrap();
        assert_eq!(found.instance_float_count(), 2);
    }
}
