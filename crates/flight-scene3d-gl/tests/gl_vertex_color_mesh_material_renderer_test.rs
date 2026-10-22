use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_geometry::{create_matrix3, create_matrix4};
use flight_lighting::Scene3DLightBlock;
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::contract::*;
use flight_materials::VERTEX_COLOR_MATERIAL_KIND;
use flight_materials::unlit_materials::create_vertex_color_material;

use crate::gl_test_helper::{count_calls, make_gl_scene3d_state, shader_sources};

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
        material: Arc::new(RwLock::new(create_vertex_color_material())),
        normal_matrix: create_matrix3(),
        subset: geometry.subsets[0],
        world_matrix: create_matrix4(),
    };
}

mod gl_vertex_color_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_compiles_the_vertex_color_variant_and_uploads_the_tint() {
        let mut state = make_gl_scene3d_state();
        let material = create_vertex_color_material();
        (GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert!(shader_sources().iter().any(|source| source.contains("#define VERTEX_COLOR")));
        assert!(count_calls("uniform_4_f32") > 0);
    }

    #[test]
    fn draw_issues_an_indexed_draw_over_the_subset_after_bind() {
        let mut state = make_gl_scene3d_state();
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            (GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&*material), &no_lights(), &make_camera());
        }
        (GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &make_geometry());
        assert!(count_calls("draw_elements") > 0);
    }
}

mod register_gl_vertex_color_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_vertex_color_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_vertex_color_material(&mut state);
        assert!(
            get_gl_mesh_material_renderer(&state, &VERTEX_COLOR_MATERIAL_KIND.to_string())
                .is_some_and(|renderer| std::ptr::eq(renderer, &GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER))
        );
    }
}
