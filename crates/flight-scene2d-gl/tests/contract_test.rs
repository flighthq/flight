use flight_render_gl::GlRenderState;
use flight_scene2d_gl::contract::{GL_SHAPE_RENDERER, register_gl_shape_rasterizer};

mod contract {
    use super::*;

    #[test]
    fn gl_shape_renderer_is_a_scene2d_renderer_with_a_submit_function() {
        let submit: fn(&mut GlRenderState, &flight_render::RenderProxy2D<GlRenderState>) =
            GL_SHAPE_RENDERER.submit;
        let _ = submit;
    }

    #[test]
    fn register_gl_shape_rasterizer_is_exported_as_a_function() {
        let _register: fn(
            &mut GlRenderState,
            Option<flight_render::ShapeRasterizer<GlRenderState>>,
        ) = register_gl_shape_rasterizer;
    }
}
