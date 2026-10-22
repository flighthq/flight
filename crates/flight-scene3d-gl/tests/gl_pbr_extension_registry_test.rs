use std::cell::RefCell;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{create_matrix3, create_vector2};
use flight_materials::PbrExtension;
use flight_materials::anisotropy_pbr_extension::create_anisotropy_pbr_extension;
use flight_render::ExternalTexture;
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
    GlPbrExtensionShaderContribution, GlRenderState, GlRenderTargetSnapshot, GlTextureRealization,
    register_gl_texture_resolver,
};
use flight_scene3d_gl::contract::*;
use flight_texture::{
    Texture, TextureColorSpace, TextureSourceRef, TextureVariant, create_texture_2d,
    get_texture_uv_matrix,
};
use glow::HasContext;

use crate::gl_test_helper::{
    calls_with, make_gl_scene3d_state, make_gl_scene3d_state_with, make_state_options, set_integer,
    uniform_location_of,
};

thread_local! {
    static BOUND_TEXTURE: RefCell<Option<Ref<Texture>>> = const { RefCell::new(None) };
}

fn noop_bind(_context: &mut dyn GlPbrExtensionBindContext, _extension: &PbrExtension) {}

fn make_contribution() -> GlPbrExtensionShaderContribution {
    return GlPbrExtensionShaderContribution {
        apply_surface: String::new(),
        contribute_ibl: String::new(),
        contribute_punctual: String::new(),
        finalize: String::new(),
        fragment_declarations: String::new(),
        fragment_functions: String::new(),
        key: "vendor".to_string(),
        samples_transmission_scene_color: None,
        texture_count: 0,
    };
}

fn vendor_contribution(
    _context: &dyn GlPbrExtensionShaderContext,
    _extension: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    return make_contribution();
}

fn six_texture_contribution(
    _context: &dyn GlPbrExtensionShaderContext,
    _extension: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    return GlPbrExtensionShaderContribution {
        texture_count: 6,
        ..make_contribution()
    };
}

fn scene_color_contribution(
    _context: &dyn GlPbrExtensionShaderContext,
    _extension: &PbrExtension,
) -> GlPbrExtensionShaderContribution {
    return GlPbrExtensionShaderContribution {
        samples_transmission_scene_color: Some(true),
        ..make_contribution()
    };
}

fn always_supported(_extension: &PbrExtension) -> bool {
    return true;
}

fn never_supported(_extension: &PbrExtension) -> bool {
    return false;
}

fn bind_transformed_texture(
    context: &mut dyn GlPbrExtensionBindContext,
    _extension: &PbrExtension,
) {
    let texture = BOUND_TEXTURE.with(|texture| texture.borrow().clone());
    // A registration binder reaches its context only through the trait (TS calls the context object).
    GlPbrExtensionBindContext::bind_texture(
        context,
        "u_map",
        "u_mapUvSet",
        "u_mapTransform",
        texture.as_ref(),
        1,
    );
}

static REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: vendor_contribution,
    is_supported: always_supported,
};

static REPLACEMENT: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: vendor_contribution,
    is_supported: always_supported,
};

static TRANSFORMED_REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: bind_transformed_texture,
    create_shader_contribution: vendor_contribution,
    is_supported: always_supported,
};

static UNSUPPORTED_REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: vendor_contribution,
    is_supported: never_supported,
};

static SIX_TEXTURE_REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: six_texture_contribution,
    is_supported: always_supported,
};

static SCENE_COLOR_REGISTRATION: GlPbrExtensionRegistration = GlPbrExtensionRegistration {
    bind: noop_bind,
    create_shader_contribution: scene_color_contribution,
    is_supported: always_supported,
};

// TS makeFakeGl2 reports 16 fragment texture units; the Rust mock reports 0 unless told.
fn make_state() -> GlRenderState {
    let state = make_gl_scene3d_state();
    set_integer(glow::MAX_TEXTURE_IMAGE_UNITS, 16);
    return state;
}

fn make_anisotropy() -> Ref<PbrExtension> {
    return Arc::new(RwLock::new(PbrExtension::Anisotropy(
        create_anisotropy_pbr_extension(),
    )));
}

fn anisotropy_kind() -> String {
    return flight_materials::ANISOTROPY_PBR_EXTENSION_KIND.to_string();
}

fn make_program(state: &GlRenderState) -> glow::NativeProgram {
    // SAFETY: allocation occurs on the deterministic mock context's owning thread.
    return unsafe { state.gl.create_program() }.unwrap();
}

fn ready_resolver(
    state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    return Some(GlTextureRealization {
        straight_alpha: false,
        // SAFETY: allocation occurs on the deterministic mock context's owning thread.
        texture: unsafe { state.gl.create_texture() }.ok()?,
    });
}

fn issue(code: GlPbrExtensionIssueCode, kind: &str) -> GlPbrExtensionIssue {
    return GlPbrExtensionIssue {
        code,
        kind: kind.to_string(),
    };
}

mod bind_gl_pbr_extensions {
    use super::*;

    #[test]
    fn binds_a_resolved_extension_list() {
        let mut state = make_state();
        let extension = make_anisotropy();
        register_gl_pbr_extension(&mut state, anisotropy_kind(), &REGISTRATION);
        let program = make_program(&state);
        assert!(bind_gl_pbr_extensions(&mut state, program, &[extension]));
    }

    #[test]
    fn uploads_the_selected_uv_set_and_the_bound_texture_own_transform() {
        let mut state = make_state();
        let extension = make_anisotropy();
        let mut source: ExternalTexture = allocate_entity();
        source.kind = "test.ready".to_string();
        let source: TextureSourceRef = Arc::new(RwLock::new(source));
        let mut texture = create_texture_2d();
        texture.source = Some(source);
        texture.uv_offset = create_vector2(0.25, 0.5);
        texture.uv_rotation = std::f32::consts::PI / 4.0;
        texture.uv_scale = create_vector2(2.0, 3.0);
        let texture: Ref<Texture> = Arc::new(RwLock::new(Texture::Texture2D(texture)));
        BOUND_TEXTURE.with(|bound| *bound.borrow_mut() = Some(texture.clone()));
        register_gl_texture_resolver(&mut state, "test.ready".to_string(), Some(ready_resolver));
        register_gl_pbr_extension(&mut state, anisotropy_kind(), &TRANSFORMED_REGISTRATION);
        let program = make_program(&state);

        assert!(bind_gl_pbr_extensions(&mut state, program, &[extension]));

        let uv_set_location = i64::from(uniform_location_of("u_mapUvSet"));
        let uv_set_call = calls_with("uniform_1_i32")
            .into_iter()
            .find(|call| call.integers[0] == uv_set_location)
            .unwrap();
        let transform_location = i64::from(uniform_location_of("u_mapTransform"));
        let transform_call = calls_with("uniform_matrix_3_f32")
            .into_iter()
            .find(|call| call.integers[0] == transform_location)
            .unwrap();
        let mut expected = create_matrix3();
        get_texture_uv_matrix(&mut expected, &*texture.read().unwrap());
        assert_eq!(uv_set_call.integers[1], 1);
        assert_eq!(transform_call.floats, expected.m.to_vec());
    }
}

mod explain_gl_pbr_extensions {
    use super::*;

    // Ruling 6: the registry asks each registration's own callback; every built-in answers true for
    // any value (TS `isSupported(): boolean { return true; }`), with no per-variant check.
    #[test]
    fn asks_each_built_in_registration_which_reports_supported() {
        let value = PbrExtension::Anisotropy(create_anisotropy_pbr_extension());
        for registration in [
            &ANISOTROPY_PBR_GL_EXTENSION,
            &CLEARCOAT_PBR_GL_EXTENSION,
            &IRIDESCENCE_PBR_GL_EXTENSION,
            &SHEEN_PBR_GL_EXTENSION,
            &SPECULAR_PBR_GL_EXTENSION,
            &TRANSMISSION_VOLUME_PBR_GL_EXTENSION,
            &WRAPPED_DIFFUSE_PBR_GL_EXTENSION,
        ] {
            assert!((registration.is_supported)(&value));
        }
    }

    #[test]
    fn reports_missing_and_duplicate_registrations_as_plain_data() {
        let mut state = make_state();
        let extension = make_anisotropy();
        assert_eq!(
            explain_gl_pbr_extensions(&mut state, &[extension.clone(), extension]),
            vec![
                issue(
                    GlPbrExtensionIssueCode::MissingRegistration,
                    "AnisotropyPbrExtension"
                ),
                issue(
                    GlPbrExtensionIssueCode::DuplicateKind,
                    "AnisotropyPbrExtension"
                ),
            ]
        );
    }

    #[test]
    fn reports_unsupported_extensions_and_extension_texture_unit_exhaustion() {
        let mut state = make_state();
        let extension = make_anisotropy();
        register_gl_pbr_extension(&mut state, anisotropy_kind(), &UNSUPPORTED_REGISTRATION);
        assert_eq!(
            explain_gl_pbr_extensions(&mut state, std::slice::from_ref(&extension)),
            vec![issue(
                GlPbrExtensionIssueCode::UnsupportedExtension,
                "AnisotropyPbrExtension"
            )]
        );

        register_gl_pbr_extension(&mut state, anisotropy_kind(), &SIX_TEXTURE_REGISTRATION);
        assert_eq!(
            explain_gl_pbr_extensions(&mut state, &[extension]),
            vec![issue(
                GlPbrExtensionIssueCode::TextureUnitExhaustion,
                "ExtendedPbrMaterial"
            )]
        );
    }

    #[test]
    fn reports_transmission_feedback_from_the_active_render_target() {
        let mut state = make_state();
        let extension = make_anisotropy();
        // SAFETY: allocation occurs on the deterministic mock context's owning thread.
        let scene_color_texture = unsafe { state.gl.create_texture() }.unwrap();
        register_gl_pbr_extension(&mut state, anisotropy_kind(), &SCENE_COLOR_REGISTRATION);
        get_gl_scene3d_runtime(&state).pbr_transmission_scene_color =
            Some(GlPbrTransmissionSceneColor {
                height: 32,
                mip_level_count: 6,
                texture: scene_color_texture,
                width: 32,
            });
        state.gl_runtime.borrow_mut().current_target = Some(GlRenderTargetSnapshot {
            color_attachments: 1,
            color_texture: Some(scene_color_texture),
            framebuffer: None,
            height: 32,
            id: 1,
            resolve_framebuffer: None,
            sample_count: 1,
            width: 32,
        });

        assert_eq!(
            explain_gl_pbr_extensions(&mut state, &[extension]),
            vec![issue(
                GlPbrExtensionIssueCode::FramebufferFeedback,
                "AnisotropyPbrExtension"
            )]
        );
    }
}

mod get_gl_pbr_extension_registration {
    use super::*;

    #[test]
    fn returns_null_before_registration() {
        let state = make_state();
        assert!(
            get_gl_pbr_extension_registration(&state, &"VendorExtension".to_string()).is_none()
        );
    }
}

mod register_gl_pbr_extension {
    use super::*;

    fn is_registration(
        actual: Option<&'static GlPbrExtensionRegistration>,
        expected: &'static GlPbrExtensionRegistration,
    ) -> bool {
        return actual.is_some_and(|actual| std::ptr::eq(actual, expected));
    }

    #[test]
    fn replaces_the_persistent_table_and_revision_while_an_explicitly_copied_state_retains_its_snapshot()
     {
        let mut screen = make_state();
        let kind = "VendorExtension".to_string();
        register_gl_pbr_extension(&mut screen, kind.clone(), &REGISTRATION);
        let snapshot = screen.gl_registries.pbr_extensions.clone();
        let mut options = make_state_options();
        options.gl_registries = screen.gl_registries.clone();
        let derived = make_gl_scene3d_state_with(&options);

        get_gl_scene3d_runtime(&derived);
        register_gl_pbr_extension(&mut screen, kind.clone(), &REPLACEMENT);

        assert!(Arc::ptr_eq(
            &derived.gl_registries.pbr_extensions,
            &snapshot
        ));
        assert_eq!(derived.gl_runtime.borrow().pbr_extension_revision, 0);
        assert!(!Arc::ptr_eq(
            &screen.gl_registries.pbr_extensions,
            &snapshot
        ));
        assert_eq!(screen.gl_runtime.borrow().pbr_extension_revision, 2);
        assert!(is_registration(
            snapshot.entries.get(&kind).copied(),
            &REGISTRATION
        ));
        assert!(is_registration(
            get_gl_pbr_extension_registration(&derived, &kind),
            &REGISTRATION
        ));
        assert!(is_registration(
            get_gl_pbr_extension_registration(&screen, &kind),
            &REPLACEMENT
        ));
    }
}

mod resolve_gl_pbr_extension_contributions {
    use super::*;

    #[test]
    fn preserves_descriptor_order() {
        let mut state = make_state();
        let extension = make_anisotropy();
        register_gl_pbr_extension(&mut state, anisotropy_kind(), &REGISTRATION);
        let keys: Vec<String> = resolve_gl_pbr_extension_contributions(&mut state, &[extension])
            .unwrap()
            .into_iter()
            .map(|value| value.key)
            .collect();
        assert_eq!(keys, vec!["vendor".to_string()]);
    }
}
