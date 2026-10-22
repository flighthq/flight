use flight_lighting::contract::*;

fn directional_options() -> DirectionalLightOptions {
    return DirectionalLightOptions {
        cascade_count: None,
        cascade_splits: None,
        casts_shadow: None,
        color: None,
        direction: None,
        enabled: None,
        intensity: None,
        intensity_unit: None,
        normal_bias: None,
        pcf_radius: None,
        shadow_bias: None,
        shadow_far: None,
        shadow_map_size: None,
        shadow_near: None,
        shadow_strength: None,
    };
}

fn selection() -> Scene3DForwardLightSelection {
    return Scene3DForwardLightSelection {
        indices: Vec::new(),
        point: Vec::new(),
        spot: Vec::new(),
    };
}

fn spot_options() -> SpotLightOptions {
    return SpotLightOptions {
        casts_shadow: None,
        color: None,
        decay: None,
        direction: None,
        enabled: None,
        inner_cone_degrees: None,
        intensity: None,
        intensity_unit: None,
        layer_mask: None,
        priority: None,
        normal_bias: None,
        outer_cone_degrees: None,
        pcf_radius: None,
        position: None,
        range: None,
        shadow_bias: None,
        shadow_far: None,
        shadow_map_size: None,
        shadow_near: None,
        shadow_strength: None,
        spot_blend: None,
    };
}

#[path = "ambient_light_test.rs"]
mod flight_lighting_ambient_light_test;
#[path = "area_light_test.rs"]
mod flight_lighting_area_light_test;
#[path = "directional_light_test.rs"]
mod flight_lighting_directional_light_test;
#[path = "enums_test.rs"]
mod flight_lighting_enums_test;
#[path = "environment_test.rs"]
mod flight_lighting_environment_test;
#[path = "hemisphere_light_test.rs"]
mod flight_lighting_hemisphere_light_test;
#[path = "light_analysis_test.rs"]
mod flight_lighting_light_analysis_test;
#[path = "light_intensity_test.rs"]
mod flight_lighting_light_intensity_test;
#[path = "light_probe_test.rs"]
mod flight_lighting_light_probe_test;
#[path = "lighting_test.rs"]
mod flight_lighting_lighting_test;
#[path = "point_light_test.rs"]
mod flight_lighting_point_light_test;
#[path = "scene_forward_lights_test.rs"]
mod flight_lighting_scene_forward_lights_test;
#[path = "scene_lights_test.rs"]
mod flight_lighting_scene_lights_test;
#[path = "spot_light_test.rs"]
mod flight_lighting_spot_light_test;
#[path = "sugar_test.rs"]
mod flight_lighting_sugar_test;
