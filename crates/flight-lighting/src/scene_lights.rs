use flight_entity::allocate_entity;

use crate::types::Scene3DLights;

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored light collections after construction
pub fn create_scene_3d_lights() -> Scene3DLights {
    let mut out: Scene3DLights = allocate_entity();
    initialize_scene_3d_lights(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical empty slots before authored assignment
pub fn initialize_scene_3d_lights(out: &mut Scene3DLights) {
    out.ambient = None;
    out.directional = None;
    out.hemisphere = Vec::new();
    out.point = Vec::new();
    out.spot = Vec::new();
}
