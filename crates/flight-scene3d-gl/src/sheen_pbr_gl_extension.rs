use std::sync::Arc;

use flight_materials::SHEEN_PBR_EXTENSION_KIND;
use flight_render_gl::GlRenderState;

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;
use crate::types::GlPbrExtensionRegistration;

pub fn register_gl_sheen_pbr_extension(state: &GlRenderState) {
    register_gl_pbr_extension(state, GlPbrExtensionRegistration {
        kind: SHEEN_PBR_EXTENSION_KIND.to_string(),
        supported: true,
        texture_unit_cost: 2,
        fragment_preamble: concat!(
            "uniform vec3 u_flightSheenColorFactor;\n",
            "uniform float u_flightSheenRoughnessFactor;\n",
        ).to_string(),
        fragment_body: String::new(),
        define_key_fn: Some(Arc::new(|_ext| "sheen".to_string())),
        bind_fn: None,
    });
}
