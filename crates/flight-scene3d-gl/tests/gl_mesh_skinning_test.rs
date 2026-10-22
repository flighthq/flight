use std::sync::{Arc, RwLock};

use flight_materials::contract::create_standard_pbr_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::*;

use crate::gl_test_helper::{
    calls_with, make_gl_scene3d_state, make_test_mesh_program, make_test_proxy, material_ref,
    uniform_location,
};

fn make_skinned_proxy() -> Scene3DRenderProxy {
    let mut proxy = make_test_proxy(
        material_ref(create_standard_pbr_material()),
        create_box_mesh_geometry(None, None, None).subsets[0],
    );
    proxy.joint_matrices = Some(Arc::new(RwLock::new(vec![0.0; 16].into_boxed_slice())));
    return proxy;
}

mod bind_gl_mesh_skin_palette {
    use super::*;

    #[test]
    fn reports_a_gpu_skinned_draw_after_binding_its_pose_palette() {
        let mut state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        program.loc_joint_texture.set(Some(Some(uniform_location("u_jointTexture"))));

        let gpu_skinned = bind_gl_mesh_skin_palette(&mut state, &program, &make_skinned_proxy());

        assert!(gpu_skinned);
        assert!(
            calls_with("uniform_1_i32")
                .iter()
                .any(|call| call.integers[1] == i64::from(SKIN_PALETTE_TEXTURE_UNIT))
        );
    }

    #[test]
    fn reports_not_skinned_when_the_program_carries_no_joint_texture() {
        let mut state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        assert!(!bind_gl_mesh_skin_palette(&mut state, &program, &make_skinned_proxy()));
    }
}

mod bind_gl_shadow_skin_palette {
    use super::*;

    #[test]
    fn uploads_the_pose_palette_on_the_skin_palette_unit() {
        let mut state = make_gl_scene3d_state();
        bind_gl_shadow_skin_palette(&mut state, &[0.0; 16]);
        assert!(calls_with("active_texture").iter().any(|call| call.integers[0]
            == i64::from(glow::TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT)));
    }
}

mod get_gl_mesh_skin_feature {
    use super::*;

    #[test]
    fn returns_null_before_registration_so_every_consumer_stays_on_the_rigid_path() {
        let state = make_gl_scene3d_state();
        assert!(get_gl_mesh_skin_feature(&state).is_none());
    }

    #[test]
    fn returns_the_capability_once_registered() {
        let state = make_gl_scene3d_state();
        register_gl_mesh_skinning(&state);
        assert!(get_gl_mesh_skin_feature(&state).is_some());
    }
}

mod gl_skin_vertex_declarations_glsl {
    use super::*;

    #[test]
    fn declares_the_influence_attributes_and_the_palette_fetch_the_has_skin_body_calls() {
        assert!(GL_SKIN_VERTEX_DECLARATIONS_GLSL.contains("a_joints0"));
        assert!(GL_SKIN_VERTEX_DECLARATIONS_GLSL.contains("a_weights0"));
        assert!(GL_SKIN_VERTEX_DECLARATIONS_GLSL.contains("mat4 skinMatrix()"));
    }

    #[test]
    fn declares_no_fragment_stage_output_since_it_is_spliced_into_vertex_sources_only() {
        // Its `in` attributes are illegal in a fragment shader, so a fragment splice would fail to compile.
        assert!(!GL_SKIN_VERTEX_DECLARATIONS_GLSL.contains("out vec4 fragColor"));
    }
}

mod register_gl_mesh_skinning {
    use super::*;

    #[test]
    fn installs_a_capability_carrying_both_the_binders_and_the_vertex_glsl() {
        let state = make_gl_scene3d_state();
        register_gl_mesh_skinning(&state);
        let feature = get_gl_scene3d_runtime(&state).mesh_skin_feature.unwrap();
        assert!(std::ptr::fn_addr_eq(
            feature.bind_mesh_skin_palette,
            bind_gl_mesh_skin_palette
                as fn(&mut flight_render_gl::GlRenderState, &GlMeshProgram, &Scene3DRenderProxy) -> bool
        ));
        assert!(std::ptr::fn_addr_eq(
            feature.bind_shadow_skin_palette,
            bind_gl_shadow_skin_palette as fn(&mut flight_render_gl::GlRenderState, &[f32])
        ));
        assert_eq!(feature.vertex_declarations_glsl, GL_SKIN_VERTEX_DECLARATIONS_GLSL);
    }

    #[test]
    fn is_idempotent_so_registering_twice_leaves_one_working_capability() {
        let state = make_gl_scene3d_state();
        register_gl_mesh_skinning(&state);
        register_gl_mesh_skinning(&state);
        assert_eq!(
            get_gl_mesh_skin_feature(&state).unwrap().vertex_declarations_glsl,
            GL_SKIN_VERTEX_DECLARATIONS_GLSL
        );
    }
}
