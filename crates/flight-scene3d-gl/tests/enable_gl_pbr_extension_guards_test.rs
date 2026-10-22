use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_lighting::{SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock};
use flight_log::{
    LogData, LogValue, MemoryLogSink, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_materials::anisotropy_pbr_extension::create_anisotropy_pbr_extension;
use flight_materials::clearcoat_pbr_extension::create_clearcoat_pbr_extension;
use flight_materials::extended_pbr_material::create_extended_pbr_material;
use flight_materials::{CLEARCOAT_PBR_EXTENSION_KIND, ExtendedPbrMaterial, PbrExtension};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState,
};
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::make_gl_scene3d_state;

// An empty light block, sized to the full packed layout (TS used 12 floats).
fn no_lights() -> Rc<Scene3DLightBlock> {
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

fn create_camera() -> Camera3D {
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

fn make_material(extensions: Vec<flight_entity::Ref<PbrExtension>>) -> ExtendedPbrMaterial {
    let mut material = create_extended_pbr_material();
    material.extensions = extensions;
    return material;
}

fn make_guarded_state() -> (GlRenderState, MemoryLogSink) {
    let state = make_gl_scene3d_state();
    let log_state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&log_state, sink.sink.clone());
    enable_gl_pbr_extension_guards(&state, Some(log_state));
    return (state, sink);
}

fn messages(sink: &MemoryLogSink) -> Vec<String> {
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, sink);
    return entries
        .iter()
        .map(|entry| match &entry.data {
            LogData::Message(message) => message.clone(),
            LogData::Record(data) => match data.get("message") {
                Some(LogValue::Str(message)) => message.clone(),
                _ => String::new(),
            },
        })
        .collect();
}

fn get_guard_messages(material: &ExtendedPbrMaterial) -> Vec<String> {
    let (mut state, sink) = make_guarded_state();
    (GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER.bind)(
        &mut state,
        Some(material),
        &no_lights(),
        &create_camera(),
    );
    return messages(&sink);
}

fn noop_bind(_context: &mut dyn GlPbrExtensionBindContext, _extension: &PbrExtension) {}

fn ok_contribution(
    _context: &dyn GlPbrExtensionShaderContext,
    _extension: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: String::new(),
        contribute_punctual: String::new(),
        finalize: String::new(),
        fragment_declarations: String::new(),
        fragment_functions: String::new(),
        key: "ok".to_string(),
        samples_transmission_scene_color: None,
        texture_count: 0,
    };
}

fn always_supported(_extension: &PbrExtension) -> bool {
    return true;
}

static OK_REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: ok_contribution,
    is_supported: always_supported,
};

mod are_gl_pbr_extension_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_until_guards_are_installed_then_true() {
        let state = make_gl_scene3d_state();
        assert!(!are_gl_pbr_extension_guards_enabled(&state));
        enable_gl_pbr_extension_guards(&state, None);
        assert!(are_gl_pbr_extension_guards_enabled(&state));
    }
}

mod enable_gl_pbr_extension_guards {
    use super::*;

    #[test]
    fn warns_with_the_registration_fix_when_an_extension_kind_is_missing() {
        let extension = Arc::new(RwLock::new(PbrExtension::Anisotropy(
            create_anisotropy_pbr_extension(),
        )));
        let messages = get_guard_messages(&make_material(vec![extension]));
        assert_eq!(messages.len(), 1);
        assert!(messages[0].contains("registerGlPbrExtension"));
    }

    #[test]
    fn warns_when_the_material_repeats_an_extension_kind() {
        let extension = Arc::new(RwLock::new(PbrExtension::Anisotropy(
            create_anisotropy_pbr_extension(),
        )));
        let messages = get_guard_messages(&make_material(vec![extension.clone(), extension]));
        // TS expects 1: its module-level logOnce already spent the missing-registration key in the
        // previous case. The D5 log state is per test here, so both issues warn once each.
        assert_eq!(messages.len(), 2);
        assert!(
            messages
                .iter()
                .any(|message| message.contains("at most once"))
        );
    }

    #[test]
    fn stays_silent_when_every_extension_has_one_supported_registration() {
        let (mut state, sink) = make_guarded_state();
        register_gl_pbr_extension(
            &mut state,
            CLEARCOAT_PBR_EXTENSION_KIND.to_string(),
            &OK_REGISTRATION,
        );
        let extension = Arc::new(RwLock::new(PbrExtension::Clearcoat(
            create_clearcoat_pbr_extension(),
        )));
        let material = make_material(vec![extension]);
        (GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER.bind)(
            &mut state,
            Some(&material),
            &no_lights(),
            &create_camera(),
        );
        assert_eq!(messages(&sink).len(), 0);
    }
}
