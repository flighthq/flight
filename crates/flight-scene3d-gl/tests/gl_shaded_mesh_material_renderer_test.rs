use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_geometry::{create_matrix3, create_matrix4};
use flight_lighting::{SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock};
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::contract::*;
use flight_shading::{
    Modifier, SHADED_MATERIAL_KIND, create_emissive_modifier, create_rim_modifier,
    create_shaded_material,
};

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

fn make_lights() -> Rc<Scene3DLightBlock> {
    // Directional { dir.xyz @0, _pad, radiance.rgb @4, _pad } + ambient { radiance.rgb @8 }.
    let mut data = vec![0.0_f32; SCENE_LIGHT_BLOCK_FLOATS];
    data[1] = -1.0;
    data[4] = 1.0;
    data[5] = 1.0;
    data[6] = 1.0;
    data[8] = 0.1;
    data[9] = 0.1;
    data[10] = 0.1;
    return Rc::new(Scene3DLightBlock {
        ambient_count: 1,
        data: data.into_boxed_slice(),
        directional_count: 1,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    });
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
        material: Arc::new(RwLock::new(create_shaded_material())),
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

fn share<T: Modifier>(modifier: T) -> Ref<dyn Modifier> {
    return Arc::new(RwLock::new(modifier));
}

mod gl_shaded_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_program_and_uploads_camera_light_block_base_colors_and_time() {
        let mut state = make_gl_scene3d_state();
        let material = create_shaded_material();
        (GL_SHADED_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &make_lights(),
            &make_camera(),
        );

        assert!(count_calls("use_program") > 0);
        assert!(has_call("enable", glow::DEPTH_TEST));
        // Light block (2 vec4) + diffuse + specular colors -> at least 4 uniform_4_f32.
        assert!(count_calls("uniform_4_f32") >= 4);
        // u_time is a uniform_1_f32 uploaded every bind.
        assert!(count_calls("uniform_1_f32") > 0);
    }

    #[test]
    fn bind_caches_the_program_under_the_shaded_namespace() {
        let mut state = make_gl_scene3d_state();
        let material = create_shaded_material();
        (GL_SHADED_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &make_lights(),
            &make_camera(),
        );
        let keys: Vec<String> = get_gl_scene3d_runtime(&state)
            .program_cache
            .keys()
            .cloned()
            .collect();
        assert!(keys.iter().any(|key| key.starts_with("shaded:")));
    }

    #[test]
    fn a_plain_shaded_material_empty_stack_compiles_the_lean_base_variant() {
        let mut state = make_gl_scene3d_state();
        let material = create_shaded_material();
        (GL_SHADED_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &make_lights(),
            &make_camera(),
        );
        // Empty modifier feature-set -> the define-key trails with an empty modifier segment. The last two
        // base flags are the (unset) uv-transform and skin flags.
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .contains_key("shaded:-------||registry:0")
        );
    }

    #[test]
    fn binds_modifier_uniforms_for_a_material_carrying_a_modifier_stack() {
        let mut state = make_gl_scene3d_state();
        register_built_in_gl_modifier_snippets(&mut state);
        set_gl_scene3d_time(&state, 1.5);
        let mut emissive = create_emissive_modifier();
        emissive.color = 0xffcc88ff;
        let mut rim = create_rim_modifier();
        rim.color = 0x88ccffff;
        let mut material = create_shaded_material();
        material.modifiers = vec![share(emissive), share(rim)];
        (GL_SHADED_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &make_lights(),
            &make_camera(),
        );
        // Emissive color + rim color each upload a uniform_3_f32 (vec3), on top of camera/ambient vec3s.
        assert!(count_calls("uniform_3_f32") >= 4);
    }

    #[test]
    fn draw_uploads_geometry_and_issues_an_indexed_draw_over_the_subset_range() {
        let mut state = make_gl_scene3d_state();
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            (GL_SHADED_MESH_MATERIAL_RENDERER.bind)(
                &mut state,
                Some(&*material),
                &make_lights(),
                &make_camera(),
            );
        }
        (GL_SHADED_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &make_geometry());

        let draws = calls_with("draw_elements");
        assert!(!draws.is_empty());
        assert_eq!(draws[0].integers[1], i64::from(proxy.subset.index_count));
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_program() {
        let mut state = make_gl_scene3d_state();
        (GL_SHADED_MESH_MATERIAL_RENDERER.draw)(&mut state, &make_proxy(), &make_geometry());
        assert_eq!(count_calls("draw_elements"), 0);
    }
}

mod register_gl_shaded_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_shaded_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_shaded_material(&mut state);
        assert!(
            get_gl_mesh_material_renderer(&state, &SHADED_MATERIAL_KIND.to_string())
                .is_some_and(|renderer| std::ptr::eq(renderer, &GL_SHADED_MESH_MATERIAL_RENDERER))
        );
    }
}
