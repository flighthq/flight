use std::sync::Arc;

use flight_materials::TRANSMISSION_VOLUME_PBR_EXTENSION_KIND;
use flight_render_gl::GlRenderState;

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;
use crate::types::GlPbrExtensionRegistration;

pub fn register_gl_transmission_volume_pbr_extension(state: &GlRenderState) {
    register_gl_pbr_extension(state, GlPbrExtensionRegistration {
        kind: TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string(),
        supported: true,
        texture_unit_cost: 2,
        fragment_preamble: concat!(
            "uniform float u_flightTransmissionFactor;\n",
            "uniform float u_flightThicknessFactor;\n",
            "uniform float u_flightAttenuationDistance;\n",
            "uniform vec3 u_flightAttenuationColor;\n",
            "uniform float u_flightIor;\n",
        ).to_string(),
        fragment_body: String::new(),
        define_key_fn: Some(Arc::new(|_ext| "transmission-volume".to_string())),
        bind_fn: None,
    });
}
