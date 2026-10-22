use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_lighting::{SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock};
use flight_materials::anisotropy_pbr_extension::create_anisotropy_pbr_extension;
use flight_materials::clearcoat_pbr_extension::create_clearcoat_pbr_extension;
use flight_materials::extended_pbr_material::create_extended_pbr_material;
use flight_materials::{EXTENDED_PBR_MATERIAL_KIND, PbrExtension};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{
    calls_with, count_calls, make_gl_scene3d_state, shader_sources, uniform_location_of,
};

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

// An empty light block, sized to the full packed layout (TS used 12 floats; its typed-array subarray
// clamps the light ranges).
fn make_lights() -> Rc<Scene3DLightBlock> {
    return Rc::new(Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0_f32; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    });
}

fn has_uniform_1_f32(name: &str, value: f32) -> bool {
    let location = i64::from(uniform_location_of(name));
    return calls_with("uniform_1_f32")
        .iter()
        .any(|call| call.integers[0] == location && call.floats[0] == value);
}

mod gl_extended_pbr_mesh_material_renderer {
    use super::*;

    #[test]
    fn binds_the_lean_no_extension_variant() {
        let mut state = make_gl_scene3d_state();
        let material = create_extended_pbr_material();
        (GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &make_lights(),
            &make_camera(),
        );
        assert!(count_calls("use_program") > 0);
    }

    #[test]
    fn assembles_and_binds_multiple_punctual_and_ibl_extension_lobes_in_one_program() {
        let mut state = make_gl_scene3d_state();
        register_gl_anisotropy_pbr_extension(&mut state);
        register_gl_clearcoat_pbr_extension(&mut state);
        let mut anisotropy = create_anisotropy_pbr_extension();
        anisotropy.anisotropy_rotation = 0.3;
        anisotropy.anisotropy_strength = 0.7;
        let mut clearcoat = create_clearcoat_pbr_extension();
        clearcoat.clearcoat = 0.8;
        clearcoat.clearcoat_roughness = 0.2;
        let mut material = create_extended_pbr_material();
        material.extensions = vec![
            Arc::new(RwLock::new(PbrExtension::Anisotropy(anisotropy))),
            Arc::new(RwLock::new(PbrExtension::Clearcoat(clearcoat))),
        ];
        (GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &make_lights(),
            &make_camera(),
        );

        let sources = shader_sources();
        let fragment_source = sources
            .iter()
            .find(|source| source.contains("flightAnisotropySample"))
            .unwrap();
        assert!(fragment_source.contains("flightVisibilitySmithGgxAnisotropic"));
        assert!(fragment_source.contains("flightClearcoatNormal"));
        assert!(fragment_source.contains("flightAnisotropyPrefiltered"));
        assert!(fragment_source.contains("flightClearcoatPrefiltered"));
        assert!(has_uniform_1_f32("u_flightAnisotropyStrength", 0.7));
        assert!(has_uniform_1_f32("u_flightClearcoat", 0.8));
    }
}

mod register_gl_extended_pbr_material {
    use super::*;

    #[test]
    fn registers_the_one_generic_material_renderer() {
        let mut state = make_gl_scene3d_state();
        register_gl_extended_pbr_material(&mut state);
        let renderer =
            get_gl_mesh_material_renderer(&state, &EXTENDED_PBR_MATERIAL_KIND.to_string());
        assert!(renderer.is_some_and(|renderer| std::ptr::eq(
            renderer,
            &GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER
        )));
    }
}
