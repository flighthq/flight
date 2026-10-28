use std::sync::{Arc, RwLock};

use flight_geometry::create_vector3;
use flight_lighting::{Scene3DLightsLike, create_point_light, create_scene_3d_lights};
use flight_materials::contract::create_standard_pbr_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_render::prepare_scene_3d_render;
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{
    add_test_mesh, log_messages, make_gl_scene3d_state, make_test_log, make_test_look_at_camera,
    make_test_pass, make_test_scene, material_ref,
};

fn excess_lights() -> Scene3DLightsLike {
    let mut lights = create_scene_3d_lights();
    lights.point = (0..5)
        .map(|x| {
            let mut light = create_point_light();
            light.position = create_vector3(x as f32 - 2.0, 0.0, 2.0);
            light.range = 10.0;
            return Arc::new(RwLock::new(light));
        })
        .collect();
    return lights;
}

mod are_gl_scene3d_forward_light_selection_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_until_guards_are_installed_then_true() {
        let state = make_gl_scene3d_state();
        assert!(!are_gl_scene3d_forward_light_selection_guards_enabled(
            &state
        ));
        enable_gl_scene3d_forward_light_selection_guards(&state, None);
        assert!(are_gl_scene3d_forward_light_selection_guards_enabled(
            &state
        ));
    }
}

mod enable_gl_scene3d_forward_light_selection_guards {
    use super::*;

    #[test]
    fn warns_when_excess_punctual_lights_draw_without_a_prepared_selection() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let (log, sink) = make_test_log();
        enable_gl_scene3d_forward_light_selection_guards(&state, Some(log));
        let scene = make_test_scene();
        add_test_mesh(
            &scene,
            create_box_mesh_geometry(None, None, None),
            vec![Some(material_ref(create_standard_pbr_material()))],
        );
        let pass = make_test_pass(&state);

        render_gl_scene3d(
            &mut state,
            &pass,
            None,
            &scene,
            &make_test_look_at_camera(),
            &excess_lights(),
            None,
        );

        let messages = log_messages(&sink);
        assert_eq!(messages.len(), 1);
        assert!(messages[0].contains("prepareGlScene3DForwardLights"));
    }

    #[test]
    fn stays_silent_when_the_explicit_per_object_selection_is_supplied() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let (log, sink) = make_test_log();
        enable_gl_scene3d_forward_light_selection_guards(&state, Some(log));
        let scene = make_test_scene();
        add_test_mesh(
            &scene,
            create_box_mesh_geometry(None, None, None),
            vec![Some(material_ref(create_standard_pbr_material()))],
        );
        let view = make_test_look_at_camera();
        let lights = excess_lights();
        prepare_scene_3d_render(&mut state, &scene, &view, &lights, None);
        let prepared = state.runtime.prepared_scene3d.take().unwrap();
        let mut selected = GlScene3DForwardLightList {
            mesh_count: 0,
            mesh_light_blocks: Vec::new(),
        };
        prepare_gl_scene3d_forward_lights(&mut selected, &mut state, &prepared.list, &lights);
        state.runtime.prepared_scene3d = Some(prepared);
        let pass = make_test_pass(&state);

        render_gl_scene3d(
            &mut state,
            &pass,
            None,
            &scene,
            &view,
            &lights,
            Some(&selected),
        );

        assert!(log_messages(&sink).is_empty());
    }

    // Re-enabling with None keeps the guard installed but silent (one rule across render guards).
    #[test]
    fn stays_silent_after_a_later_enable_with_none_replaces_the_log() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let (log, sink) = make_test_log();
        enable_gl_scene3d_forward_light_selection_guards(&state, Some(log));
        enable_gl_scene3d_forward_light_selection_guards(&state, None);
        let scene = make_test_scene();
        add_test_mesh(
            &scene,
            create_box_mesh_geometry(None, None, None),
            vec![Some(material_ref(create_standard_pbr_material()))],
        );
        let pass = make_test_pass(&state);
        render_gl_scene3d(
            &mut state,
            &pass,
            None,
            &scene,
            &make_test_look_at_camera(),
            &excess_lights(),
            None,
        );
        assert!(are_gl_scene3d_forward_light_selection_guards_enabled(
            &state
        ));
        assert!(log_messages(&sink).is_empty());
    }
}
