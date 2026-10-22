use flight_materials::contract::create_standard_pbr_material;
use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_render::{RenderTargetDepth, RenderTargetDescriptor, Scene3DRenderProxy};
use flight_render_gl::{
    GlMeshMaterialRenderer, GlRenderState, GlTextureRenderTarget, create_gl_texture_render_target,
};
use flight_scene3d_gl::contract::*;
use flight_texture::RenderTargetColorSpace;

use crate::gl_test_helper::{
    add_test_mesh, calls_with, make_gl_scene3d_state, make_test_lights, make_test_look_at_camera,
    make_test_scene, material_ref, thrown_message,
};

fn make_target(state: &GlRenderState) -> GlTextureRenderTarget {
    return create_gl_texture_render_target(
        state,
        &RenderTargetDescriptor {
            width: 256.0,
            height: 256.0,
            format: None,
            color_attachments: None,
            color_formats: None,
            sample_count: None,
            depth: Some(RenderTargetDepth::DepthStencil),
            color_space: Some(RenderTargetColorSpace::Linear),
        },
        None,
    )
    .unwrap()
    .unwrap();
}

fn make_scene() -> flight_node::NodeRef {
    let scene = make_test_scene();
    add_test_mesh(
        &scene,
        create_box_mesh_geometry(None, None, None),
        vec![Some(material_ref(create_standard_pbr_material()))],
    );
    return scene;
}

fn throwing_bind(
    _state: &mut GlRenderState,
    _material: Option<&dyn flight_materials::Material3D>,
    _lights: &flight_lighting::Scene3DLightBlock,
    _camera: &flight_camera::Camera3D,
) {
}

fn throwing_draw(_state: &mut GlRenderState, _proxy: &Scene3DRenderProxy, _geometry: &MeshGeometry) {
    flight_entity::throw_error("custom draw failed");
}

static THROWING_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: throwing_bind,
    draw: throwing_draw,
};

mod present_gl_scene3d {
    use super::*;

    #[test]
    fn renders_into_the_target_then_presents_to_the_canvas_default_framebuffer() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_scene();
        let mut target = make_target(&state);
        let framebuffer = i64::from(target.framebuffer.0.get());

        present_gl_scene3d(&mut state, &mut target, &scene, &make_test_look_at_camera(), &make_test_lights());

        let framebuffer_binds = calls_with("bind_framebuffer");
        // The scene is drawn into the target's framebuffer...
        assert!(framebuffer_binds.iter().any(|call| call.integers[1] == framebuffer));
        // ...and the linear->sRGB present writes to the canvas (default framebuffer = 0).
        assert!(framebuffer_binds.iter().any(|call| call.integers[1] == 0));
    }

    #[test]
    fn clears_the_background_color_and_the_depth_buffer_before_drawing() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_scene();
        let mut target = make_target(&state);

        present_gl_scene3d(&mut state, &mut target, &scene, &make_test_look_at_camera(), &make_test_lights());

        // begin_gl_render_pass clears per-attachment (clearBufferfv for color location 0) and the
        // depth/stencil buffer (clearBufferfi).
        let color_clears = calls_with("clear_buffer_f32");
        assert!(color_clears.iter().any(|call| call.integers[0] == i64::from(glow::COLOR)
            && call.integers[1] == 0));
        let depth_clears = calls_with("clear_buffer_depth_stencil");
        assert!(depth_clears
            .iter()
            .any(|call| call.integers[0] == i64::from(glow::DEPTH_STENCIL)));
    }

    #[test]
    fn presents_to_the_canvas_after_the_scene_draw_so_the_encode_reads_the_rendered_target() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_scene();
        let mut target = make_target(&state);
        let texture = i64::from(target.texture.0.get());

        present_gl_scene3d(&mut state, &mut target, &scene, &make_test_look_at_camera(), &make_test_lights());

        let names = crate::gl_test_helper::call_names();
        let last_texture_bind = names.iter().rposition(|name| name == "bind_texture");
        let last_draw = names.iter().rposition(|name| name == "draw_elements");
        // The present pass binds the scene texture and draws the fullscreen quad as the final operations.
        assert!(last_texture_bind.is_some_and(|index| index > 0));
        assert!(last_draw.is_some_and(|index| index > 0));
        assert!(calls_with("bind_texture").iter().any(|call| call.integers[1] == texture));
    }

    #[test]
    fn ends_the_target_pass_when_scene_drawing_throws() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_material_renderer(
            &mut state,
            STANDARD_PBR_MATERIAL_KIND.to_string(),
            &THROWING_RENDERER,
        );
        let scene = make_scene();
        let mut target = make_target(&state);

        let message = thrown_message(|| {
            present_gl_scene3d(&mut state, &mut target, &scene, &make_test_look_at_camera(), &make_test_lights());
        });
        assert_eq!(message, "custom draw failed");
        assert!(state.gl_runtime.borrow().current_target.is_none());
    }
}
