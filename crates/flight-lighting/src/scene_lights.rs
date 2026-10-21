use flight_entity::allocate_entity;

use crate::types::{Scene3DLights, Scene3DLightsOptions};

pub fn create_scene_3d_lights(options: Option<&Scene3DLightsOptions>) -> Scene3DLights {
    let mut out: Scene3DLights = allocate_entity();
    initialize_scene_3d_lights(&mut out, options);
    return out;
}

pub fn initialize_scene_3d_lights(out: &mut Scene3DLights, options: Option<&Scene3DLightsOptions>) {
    out.ambient = options.and_then(|value| value.ambient.clone());
    out.directional = options.and_then(|value| value.directional.clone());
    out.hemisphere = options
        .and_then(|value| value.hemisphere.clone())
        .unwrap_or_default();
    out.point = options
        .and_then(|value| value.point.clone())
        .unwrap_or_default();
    out.spot = options
        .and_then(|value| value.spot.clone())
        .unwrap_or_default();
}
