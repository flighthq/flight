use std::sync::Arc;

use flight_materials::CLEARCOAT_PBR_EXTENSION_KIND;
use flight_render_gl::GlRenderState;

use crate::gl_pbr_extension_registry::register_gl_pbr_extension;
use crate::types::GlPbrExtensionRegistration;

pub fn register_gl_clearcoat_pbr_extension(state: &GlRenderState) {
    register_gl_pbr_extension(state, GlPbrExtensionRegistration {
        kind: CLEARCOAT_PBR_EXTENSION_KIND.to_string(),
        supported: true,
        texture_unit_cost: 2,
        fragment_preamble: concat!(
            "uniform float u_flightClearcoatFactor;\n",
            "uniform float u_flightClearcoatRoughnessFactor;\n",
        ).to_string(),
        fragment_body: String::new(),
        define_key_fn: Some(Arc::new(|_ext| "clearcoat".to_string())),
        bind_fn: None,
    });
}
