use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_geometry::{create_matrix3, create_matrix4};
use flight_lighting::{SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock};
use flight_materials::pbr_materials::create_specular_glossiness_pbr_material;
use flight_materials::{Material3DRef, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{count_calls, make_gl_scene3d_state};

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

// Sized to the full packed block (TS used 12 floats; its typed-array subarray clamps the light ranges).
fn make_lights() -> Rc<Scene3DLightBlock> {
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

fn make_proxy() -> Scene3DRenderProxy {
    let geometry = create_box_mesh_geometry(None, None, None);
    let material: Material3DRef = Arc::new(RwLock::new(create_specular_glossiness_pbr_material()));
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

mod gl_specular_glossiness_pbr_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_converts_spec_gloss_to_a_standard_block_and_uploads_it_through_the_base_pbr_program() {
        let mut state = make_gl_scene3d_state();
        let mut material = create_specular_glossiness_pbr_material();
        material.diffuse = 0xc08040ff;
        material.glossiness = 0.7;
        material.specular = 0x404040ff;
        (GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &make_lights(),
            &make_camera(),
        );
        assert!(count_calls("use_program") > 0);
        assert!(count_calls("uniform_4_f32") > 0);
        assert!(count_calls("uniform_matrix_4_f32") > 0);
    }

    #[test]
    fn binds_the_base_pbr_program_no_extension_define_under_the_pbr_namespace() {
        let mut state = make_gl_scene3d_state();
        let material = create_specular_glossiness_pbr_material();
        (GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.bind)(
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
        assert_eq!(keys.len(), 1);
        assert!(keys[0].starts_with("pbr:"));
        // The standard renderer contributes no extension identity; the only post-colon standard slot is
        // the unset skin flag.
        assert_eq!(keys[0].split(':').nth(2), Some("--"));
    }

    #[test]
    fn draw_issues_an_indexed_draw_after_bind() {
        let mut state = make_gl_scene3d_state();
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            (GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.bind)(
                &mut state,
                Some(&*material),
                &make_lights(),
                &make_camera(),
            );
        }
        (GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.draw)(
            &mut state,
            &proxy,
            &create_box_mesh_geometry(None, None, None),
        );
        assert!(count_calls("draw_elements") > 0);
    }

    #[test]
    fn draw_is_a_no_op_before_bind() {
        let mut state = make_gl_scene3d_state();
        (GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.draw)(
            &mut state,
            &make_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(count_calls("draw_elements"), 0);
    }
}

mod register_gl_specular_glossiness_pbr_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_specular_glossiness_pbr_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_specular_glossiness_pbr_material(&mut state);
        let renderer = get_gl_mesh_material_renderer(
            &state,
            &SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string(),
        );
        assert!(renderer.is_some_and(|renderer| std::ptr::eq(
            renderer,
            &GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER
        )));
    }
}
