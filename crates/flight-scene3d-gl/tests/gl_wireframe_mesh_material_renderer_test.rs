use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_geometry::{create_matrix3, create_matrix4};
use flight_lighting::Scene3DLightBlock;
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::contract::*;
use flight_materials::unlit_materials::create_wireframe_material;
use flight_materials::{MaterialAlphaMode, WIREFRAME_MATERIAL_KIND};

use crate::gl_test_helper::{calls_with, count_calls, make_gl_scene3d_state};

fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 0.1;
    let projection = create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = 1.0;
        projection.fov_y = std::f32::consts::PI / 3.0;
    }
    camera.projection = Projection::Perspective(projection);
    return camera;
}

fn no_lights() -> Scene3DLightBlock {
    return Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0_f32; 12].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    };
}

fn make_geometry() -> MeshGeometry {
    return create_box_mesh_geometry(None, None, None);
}

fn make_proxy() -> Scene3DRenderProxy {
    let geometry = make_geometry();
    return Scene3DRenderProxy {
        alpha: None,
        color_scale_bias: None,
        color_matrix: None,
        instance_count: None,
        instance_matrices: None,
        instance_colors: None,
        joint_matrices: None,
        normal_matrices: None,
        material: Arc::new(RwLock::new(create_wireframe_material())),
        normal_matrix: create_matrix3(),
        subset: geometry.subsets[0],
        world_matrix: create_matrix4(),
    };
}

fn has_call(name: &str, argument: u32) -> bool {
    return calls_with(name)
        .iter()
        .any(|call| call.integers.first() == Some(&i64::from(argument)));
}

mod gl_wireframe_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_the_program_disables_culling_and_uploads_the_line_color() {
        let mut state = make_gl_scene3d_state();
        let material = create_wireframe_material();
        (GL_WIREFRAME_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert!(count_calls("use_program") > 0);
        assert!(has_call("disable", glow::CULL_FACE));
        assert!(count_calls("uniform_4_f32") > 0);
    }

    #[test]
    fn bind_selects_the_masked_program_and_uploads_alpha_cutoff() {
        let mut state = make_gl_scene3d_state();
        let mut material = create_wireframe_material();
        material.alpha_cutoff = 0.25;
        material.alpha_mode = MaterialAlphaMode::Mask;
        (GL_WIREFRAME_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert!(
            calls_with("uniform_1_f32")
                .iter()
                .any(|call| call.floats.first() == Some(&0.25))
        );
    }

    #[test]
    fn draw_issues_a_lines_draw_over_the_derived_line_range() {
        let mut state = make_gl_scene3d_state();
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            (GL_WIREFRAME_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&*material), &no_lights(), &make_camera());
        }
        (GL_WIREFRAME_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &make_geometry());
        let draws = calls_with("draw_elements");
        assert!(!draws.is_empty());
        // Line index count = triangle index count * 2.
        assert_eq!(draws[0].integers[1], i64::from(proxy.subset.index_count * 2));
    }

    // This family binds its own line-index VAO and bypasses draw_gl_mesh_subset, which is where every
    // other family gets its per-draw object alpha. While that upload was only inside
    // draw_gl_mesh_subset the wireframe shader read u_objectAlpha = 0, harmless until the fragment tail
    // began premultiplying rgb by alpha and turned the whole frame black.
    #[test]
    fn draw_uploads_the_per_draw_object_alpha_it_cannot_get_from_draw_gl_mesh_subset() {
        let mut state = make_gl_scene3d_state();
        let mut proxy = make_proxy();
        proxy.alpha = Some(0.5);
        {
            let material = proxy.material.read().unwrap();
            (GL_WIREFRAME_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&*material), &no_lights(), &make_camera());
        }
        (GL_WIREFRAME_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &make_geometry());

        assert!(
            calls_with("uniform_1_f32")
                .iter()
                .any(|call| call.floats.first() == Some(&0.5))
        );
    }

    #[test]
    fn draw_binds_the_bone_palette_consumed_by_the_skinned_line_variant() {
        let mut state = make_gl_scene3d_state();
        let mut proxy = make_proxy();
        proxy.joint_matrices = Some(Arc::new(RwLock::new(vec![0.0; 16].into_boxed_slice())));
        proxy.normal_matrices = Some(Arc::new(RwLock::new(vec![0.0; 12].into_boxed_slice())));
        register_gl_mesh_skinning(&state);
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        {
            let material = proxy.material.read().unwrap();
            (GL_WIREFRAME_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&*material), &no_lights(), &make_camera());
        }
        (GL_WIREFRAME_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &make_geometry());

        assert!(has_call("active_texture", glow::TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT));
        assert!(
            calls_with("uniform_1_i32")
                .iter()
                .any(|call| call.integers.get(1) == Some(&i64::from(SKIN_PALETTE_TEXTURE_UNIT)))
        );
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_program() {
        let mut state = make_gl_scene3d_state();
        (GL_WIREFRAME_MESH_MATERIAL_RENDERER.draw)(&mut state, &make_proxy(), &make_geometry());
        assert_eq!(count_calls("draw_elements"), 0);
    }
}

mod register_gl_wireframe_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_wireframe_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_wireframe_material(&mut state);
        assert!(
            get_gl_mesh_material_renderer(&state, &WIREFRAME_MATERIAL_KIND.to_string())
                .is_some_and(|renderer| std::ptr::eq(renderer, &GL_WIREFRAME_MESH_MATERIAL_RENDERER))
        );
    }
}
