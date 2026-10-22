//! D18 method conveniences delegate to the contract free functions. Inline tests compare both paths.

use crate::contract::*;

impl LightUnit {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_light_unit(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_light_unit_string(self);
    }
}

impl Scene3DForwardLightSelectionReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_scene_3d_forward_light_selection_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_scene_3d_forward_light_selection_reason_string(self);
    }
}

impl AmbientLight {
    pub fn new() -> Self {
        return create_ambient_light();
    }

    pub fn clone_ambient_light(&self) -> Self {
        return clone_ambient_light(self);
    }
}

impl DirectionalLight {
    pub fn new(options: Option<&DirectionalLightOptions>) -> Self {
        return create_directional_light(options);
    }

    pub fn clone_directional_light(&self) -> Self {
        return clone_directional_light(self);
    }

    pub fn set_direction(&mut self, x: f32, y: f32, z: f32) {
        set_directional_light_direction(self, x, y, z);
    }

    pub fn set_target(
        &mut self,
        from_x: f32,
        from_y: f32,
        from_z: f32,
        to_x: f32,
        to_y: f32,
        to_z: f32,
    ) {
        set_directional_light_target(self, from_x, from_y, from_z, to_x, to_y, to_z);
    }
}

impl PointLight {
    pub fn new() -> Self {
        return create_point_light();
    }

    pub fn clone_point_light(&self) -> Self {
        return clone_point_light(self);
    }
}

impl SpotLight {
    pub fn new(options: Option<&SpotLightOptions>) -> Self {
        return create_spot_light(options);
    }

    pub fn clone_spot_light(&self) -> Self {
        return clone_spot_light(self);
    }

    pub fn cone_degrees(&self, out: &mut SpotLightConeAngles) {
        get_spot_light_cone_degrees(out, self);
    }

    pub fn set_blend(&mut self, blend: f32) {
        set_spot_light_blend(self, blend);
    }

    pub fn set_cone(&mut self, inner_degrees: f32, outer_degrees: f32) {
        set_spot_light_cone(self, inner_degrees, outer_degrees);
    }

    pub fn set_direction(&mut self, x: f32, y: f32, z: f32) {
        set_spot_light_direction(self, x, y, z);
    }

    pub fn set_target(&mut self, target_x: f32, target_y: f32, target_z: f32) {
        set_spot_light_target(self, target_x, target_y, target_z);
    }
}

impl HemisphereLight {
    pub fn new() -> Self {
        return create_hemisphere_light();
    }

    pub fn clone_hemisphere_light(&self) -> Self {
        return clone_hemisphere_light(self);
    }
}

impl AreaLight {
    pub fn new() -> Self {
        return create_area_light();
    }

    pub fn clone_area_light(&self) -> Self {
        return clone_area_light(self);
    }

    pub fn set_orientation(
        &mut self,
        direction: &flight_geometry::Vector3,
        right: &flight_geometry::Vector3,
        up: &flight_geometry::Vector3,
    ) {
        set_area_light_orientation(self, direction, right, up);
    }
}

impl Environment {
    pub fn new() -> Self {
        return create_environment();
    }

    pub fn clone_environment(&self) -> Self {
        return clone_environment(self);
    }
}

impl LightProbe {
    pub fn new(
        position: &flight_geometry::Vector3,
        sh_coefficients: Option<&flight_entity::Float32Array>,
    ) -> Self {
        return create_light_probe(position, sh_coefficients);
    }

    pub fn evaluate(
        &self,
        out: &mut flight_entity::Float32Array,
        normal: &flight_geometry::Vector3,
    ) {
        evaluate_light_probe_sh(out, normal, &self.sh_coefficients);
    }

    pub fn set_sh_from_colors(
        &mut self,
        colors: &flight_entity::Float32Array,
        directions: &flight_entity::Float32Array,
    ) {
        set_light_probe_sh_from_colors(self, colors, directions);
    }
}

impl LightProbeGrid {
    pub fn new(
        probes: &[flight_entity::Ref<LightProbe>],
        bounds: &flight_geometry::Aabb,
        resolution: &flight_geometry::Vector3,
    ) -> Self {
        return create_light_probe_grid(probes, bounds, resolution);
    }

    pub fn sample(
        &self,
        out: &mut flight_entity::Float32Array,
        position: &flight_geometry::Vector3,
    ) -> bool {
        return sample_light_probe_grid(out, position, self);
    }
}

impl Scene3DLights {
    pub fn new() -> Self {
        return create_scene_3d_lights();
    }
}
