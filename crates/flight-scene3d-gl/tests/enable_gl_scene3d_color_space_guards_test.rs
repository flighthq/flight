use flight_materials::contract::create_standard_pbr_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{
    add_test_mesh, log_messages, make_gl_scene3d_state, make_test_lights, make_test_log,
    make_test_look_at_camera, make_test_pass, make_test_scene, material_ref,
};

mod are_gl_scene3d_color_space_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_until_guards_are_installed_then_true() {
        let state = make_gl_scene3d_state();
        assert!(!are_gl_scene3d_color_space_guards_enabled(&state));
        enable_gl_scene3d_color_space_guards(&state, None);
        assert!(are_gl_scene3d_color_space_guards_enabled(&state));
    }
}

mod enable_gl_scene3d_color_space_guards {
    use super::*;

    #[test]
    fn warns_once_when_a_scene_is_drawn_directly_to_the_canvas_no_target_to_encode() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_test_mesh(
            &scene,
            create_box_mesh_geometry(None, None, None),
            vec![Some(material_ref(create_standard_pbr_material()))],
        );
        let (log, sink) = make_test_log();
        enable_gl_scene3d_color_space_guards(&state, Some(log));
        // No begin_gl_render_pass: no target is current, so the scene draws straight to the canvas.
        let pass = make_test_pass(&state);

        render_gl_scene3d(
            &mut state,
            &pass,
            None,
            &scene,
            &make_test_look_at_camera(),
            &make_test_lights(),
            None,
        );

        let messages = log_messages(&sink);
        assert_eq!(messages.len(), 1);
        assert!(messages[0].contains("renderGlScene3D"));
    }

    // Re-enabling with None keeps the guard installed but silent (one rule across render guards).
    #[test]
    fn stays_silent_after_a_later_enable_with_none_replaces_the_log() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_test_mesh(
            &scene,
            create_box_mesh_geometry(None, None, None),
            vec![Some(material_ref(create_standard_pbr_material()))],
        );
        let (log, sink) = make_test_log();
        enable_gl_scene3d_color_space_guards(&state, Some(log));
        enable_gl_scene3d_color_space_guards(&state, None);
        let pass = make_test_pass(&state);
        render_gl_scene3d(
            &mut state,
            &pass,
            None,
            &scene,
            &make_test_look_at_camera(),
            &make_test_lights(),
            None,
        );
        assert!(are_gl_scene3d_color_space_guards_enabled(&state));
        assert!(log_messages(&sink).is_empty());
    }

    // Each guard owns its destination: re-enabling OTHER guard families with None must not silence
    // this one (Principal ruling: None silences only the guard it is passed to).
    #[test]
    fn keeps_reporting_after_other_guard_families_are_enabled_with_none() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_test_mesh(
            &scene,
            create_box_mesh_geometry(None, None, None),
            vec![Some(material_ref(create_standard_pbr_material()))],
        );
        let (log, sink) = make_test_log();
        enable_gl_scene3d_color_space_guards(&state, Some(log));
        enable_gl_scene3d_deform_guards(&state, None);
        enable_gl_pbr_extension_guards(&state, None);
        enable_gl_scene3d_forward_light_selection_guards(&state, None);
        enable_gl_scene3d_custom_shader_guards(&state, None);
        let pass = make_test_pass(&state);
        render_gl_scene3d(
            &mut state,
            &pass,
            None,
            &scene,
            &make_test_look_at_camera(),
            &make_test_lights(),
            None,
        );
        assert_eq!(log_messages(&sink).len(), 1);
    }
}
