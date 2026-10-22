mod ambient_light_test;
mod area_light_test;
mod directional_light_test;
mod enums_test;
mod environment_test;
mod hemisphere_light_test;
mod light_analysis_test;
mod light_intensity_test;
mod light_probe_test;
mod lighting_test;
mod point_light_test;
mod scene_forward_lights_test;
mod scene_lights_test;
mod spot_light_test;
mod sugar_test;

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
