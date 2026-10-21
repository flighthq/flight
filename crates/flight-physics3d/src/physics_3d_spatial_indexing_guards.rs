// flight-lint: allow-file(conform-params) D5: diagnostics guard state is explicit caller-owned state
use crate::*;

pub fn report_physics_3d_spatial_indexing(
    world: &Physics3DWorld,
    guards: Option<&Physics3DGuardState>,
) {
    if let Some(guard) = guards.and_then(|guards| guards.spatial_indexing_guard.as_ref()) {
        guard(world);
    }
}

pub fn set_physics_3d_spatial_indexing_guard(
    guards: &mut Physics3DGuardState,
    guard: Option<Physics3DSpatialIndexingGuard>,
) {
    guards.spatial_indexing_guard = guard;
}
