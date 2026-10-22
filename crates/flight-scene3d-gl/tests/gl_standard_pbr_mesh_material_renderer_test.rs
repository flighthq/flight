use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_geometry::{create_matrix3, create_matrix4};
use flight_lighting::{SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock};
use flight_materials::Material3DRef;
use flight_materials::pbr_materials::create_standard_pbr_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::*;

use crate::gl_test_helper::{calls_with, count_calls, make_gl_scene3d_state};

fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 0.1;
    let projection = create_perspective_projection();
    {
        let mut perspective = projection.write().unwrap();
        perspective.aspect = 1.0;
        perspective.fov_y = std::f32::consts::PI / 3.0;
    }
    camera.projection = Projection::Perspective(projection);
    return camera;
}

fn make_lights() -> Scene3DLightBlock {
    // Directional { dir.xyz @0, _pad, radiance.rgb @4, _pad } + ambient { radiance.rgb @8 }. Sized to
    // the full packed block (TS used 12 floats; its typed-array subarray clamps the light ranges).
    let mut data = vec![0.0_f32; SCENE_LIGHT_BLOCK_FLOATS];
    data[1] = -1.0;
    data[4] = 1.0;
    data[5] = 1.0;
    data[6] = 1.0;
    data[8] = 0.1;
    data[9] = 0.1;
    data[10] = 0.1;
    return Scene3DLightBlock {
        ambient_count: 1,
        data: data.into_boxed_slice(),
        directional_count: 1,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    };
}

fn make_proxy() -> Scene3DRenderProxy {
    let geometry = create_box_mesh_geometry(None, None, None);
    let material: Material3DRef = Arc::new(RwLock::new(create_standard_pbr_material()));
    return Scene3DRenderProxy {
        alpha: None,
        color_scale_bias: None,
        color_matrix: None,
        instance_count: None,
        instance_matrices: None,
        instance_colors: None,
        joint_matrices: None,
        normal_matrices: None,
        material,
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

mod gl_standard_pbr_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_program_sets_depth_cull_state_and_uploads_camera_light_material_uniforms() {
        let mut state = make_gl_scene3d_state();
        let material = create_standard_pbr_material();
        (GL_STANDARD_PBR_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &make_lights(), &make_camera());

        assert!(count_calls("use_program") > 0);
        assert!(has_call("enable", glow::DEPTH_TEST));
        assert!(has_call("depth_func", glow::LESS));
        assert!(has_call("enable", glow::CULL_FACE));
        assert!(count_calls("uniform_matrix_4_f32") > 0);
        assert!(count_calls("uniform_4_f32") > 0);
    }

    #[test]
    fn bind_disables_back_face_culling_for_a_double_sided_material() {
        let mut state = make_gl_scene3d_state();
        let mut material = create_standard_pbr_material();
        material.double_sided = true;
        (GL_STANDARD_PBR_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &make_lights(), &make_camera());
        assert!(has_call("disable", glow::CULL_FACE));
    }

    #[test]
    fn draw_uploads_geometry_and_issues_an_indexed_draw_over_the_subset_range() {
        let mut state = make_gl_scene3d_state();
        let proxy = make_proxy();
        let geometry = create_box_mesh_geometry(None, None, None);
        {
            let material = proxy.material.read().unwrap();
            (GL_STANDARD_PBR_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&*material), &make_lights(), &make_camera());
        }
        (GL_STANDARD_PBR_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &geometry);

        let draws = calls_with("draw_elements");
        assert!(!draws.is_empty());
        assert_eq!(draws[0].integers[1], i64::from(proxy.subset.index_count));
        assert!(count_calls("uniform_matrix_3_f32") > 0);
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_program() {
        let mut state = make_gl_scene3d_state();
        (GL_STANDARD_PBR_MESH_MATERIAL_RENDERER.draw)(&mut state, &make_proxy(), &create_box_mesh_geometry(None, None, None));
        assert_eq!(count_calls("draw_elements"), 0);
    }

    #[test]
    fn bind_uploads_the_full_standard_block_including_occlusion_strength_and_emissive() {
        let mut state = make_gl_scene3d_state();
        let mut material = create_standard_pbr_material();
        material.metallic = 0.25;
        material.occlusion_strength = 0.7;
        material.roughness = 0.4;
        (GL_STANDARD_PBR_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &make_lights(), &make_camera());
        // The standard block uploads metallic + roughness + normalScale + emissiveStrength +
        // occlusionStrength as uniform1f, so at least five scalar uploads land.
        assert!(count_calls("uniform_1_f32") >= 5);
        assert!(count_calls("uniform_3_f32") > 0);
    }
}
