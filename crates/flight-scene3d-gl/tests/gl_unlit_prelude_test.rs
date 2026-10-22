use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_color::{LinearColor, allocate_linear_color};
use flight_render::{CreateRenderTextureOptions, create_render_texture};
use flight_render_gl::{register_gl_bitmap_texture_resolver, register_gl_render_texture_resolver};
use flight_scene3d_gl::*;
use flight_texture::{Texture, TextureSourceRef, TextureUvTransform, create_texture_2d};

use crate::gl_test_helper::{
    calls_with, count_calls, make_gl_scene3d_state, test_default,
};

fn flat() -> GlUnlitDefineKey {
    return GlUnlitDefineKey {
        alpha_mask_enabled: false,
        has_color_map: false,
        has_uv_transform: false,
        vertex_color: false,
        ..test_default()
    };
}

fn color() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 0.5;
    color.g = 0.25;
    color.b = 0.1;
    color.a = 1.0;
    return color;
}

// A still bitmap-backed Texture (the Rust stand-in for TS's host image / video resources, which need a
// host capability scene3d-gl does not depend on).
fn make_bitmap_texture(width: u32, height: u32) -> Texture {
    let source: TextureSourceRef = Arc::new(RwLock::new(create_bitmap(width, height, None)));
    let mut texture = create_texture_2d();
    texture.source = Some(source);
    texture.texture_fields_mut().sampler.mipmaps = false;
    return Texture::Texture2D(texture);
}

fn make_render_texture() -> Texture {
    let mut texture = create_render_texture(&CreateRenderTextureOptions {
        height: 16,
        width: 16,
        ..test_default()
    });
    texture.texture_fields_mut().sampler.mipmaps = false;
    return Texture::Texture2D(texture);
}

mod bind_gl_unlit_surface {
    use super::*;

    #[test]
    fn uploads_the_color_intensity_and_alpha_cutoff() {
        let mut state = make_gl_scene3d_state();
        let program = compile_gl_unlit_program(&state.gl.clone(), &flat(), None);
        bind_gl_unlit_surface(&mut state, &program, &color(), 2.0, None, 0.5);
        assert!(count_calls("uniform_4_f32") > 0);
        assert!(count_calls("uniform_1_f32") >= 2);
        // No color map → no texture bind.
        assert_eq!(count_calls("bind_texture"), 0);
    }

    #[test]
    fn routes_a_still_map_through_the_registered_texture_resolver() {
        let mut state = make_gl_scene3d_state();
        let key = GlUnlitDefineKey {
            has_color_map: true,
            ..flat()
        };
        let program = compile_gl_unlit_program(&state.gl.clone(), &key, None);
        let texture = make_bitmap_texture(1, 1);
        register_gl_bitmap_texture_resolver(&mut state);

        bind_gl_unlit_surface(&mut state, &program, &color(), 1.0, Some(&texture), 0.5);

        assert!(count_calls("tex_image_2d") > 0);
        assert!(count_calls("uniform_1_i32") > 0);
    }

    #[test]
    fn routes_an_unrendered_render_texture_to_the_null_sentinel_without_a_cpu_upload() {
        let mut state = make_gl_scene3d_state();
        let key = GlUnlitDefineKey {
            has_color_map: true,
            ..flat()
        };
        let program = compile_gl_unlit_program(&state.gl.clone(), &key, None);
        let texture = make_render_texture();
        register_gl_render_texture_resolver(&mut state);
        let uploads = count_calls("tex_image_2d");

        bind_gl_unlit_surface(&mut state, &program, &color(), 1.0, Some(&texture), 0.5);

        assert!(
            calls_with("bind_texture")
                .iter()
                .any(|call| call.integers[1] == 0)
        );
        assert_eq!(count_calls("tex_image_2d"), uploads);
        assert_eq!(count_calls("uniform_1_i32"), 0);
    }

    #[test]
    fn routes_a_video_backed_texture_through_the_registered_texture_resolver() {
        // A dynamic host video frame needs flight-host; a 320x240 bitmap source exercises the same
        // registered-resolver route and upload.
        let mut state = make_gl_scene3d_state();
        let key = GlUnlitDefineKey {
            has_color_map: true,
            ..flat()
        };
        let program = compile_gl_unlit_program(&state.gl.clone(), &key, None);
        let video_map = make_bitmap_texture(320, 240);
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_bitmap_texture_resolver(&mut state);

        bind_gl_unlit_surface(&mut state, &program, &color(), 1.0, Some(&video_map), 0.5);

        assert!(count_calls("uniform_4_f32") > 0);
        assert!(count_calls("tex_image_2d") > 0);
        assert!(count_calls("bind_texture") > 0);
        assert!(count_calls("uniform_1_i32") > 0);
    }

    #[test]
    fn does_not_upload_a_video_frame_whose_source_version_has_not_advanced() {
        let mut state = make_gl_scene3d_state();
        let key = GlUnlitDefineKey {
            has_color_map: true,
            ..flat()
        };
        let program = compile_gl_unlit_program(&state.gl.clone(), &key, None);
        let video_map = make_bitmap_texture(320, 240);
        register_gl_bitmap_texture_resolver(&mut state);
        register_gl_bitmap_texture_resolver(&mut state);
        bind_gl_unlit_surface(&mut state, &program, &color(), 1.0, Some(&video_map), 0.5);
        let uploads = count_calls("tex_image_2d");
        bind_gl_unlit_surface(&mut state, &program, &color(), 1.0, Some(&video_map), 0.5);
        assert_eq!(count_calls("tex_image_2d"), uploads);
    }
}

mod build_gl_unlit_define_key {
    use super::*;

    #[test]
    fn produces_distinct_stable_strings_per_flag_set() {
        assert_eq!(build_gl_unlit_define_key(&flat()), "------");
        assert_eq!(
            build_gl_unlit_define_key(&GlUnlitDefineKey {
                alpha_mask_enabled: true,
                has_color_map: true,
                has_uv_transform: true,
                vertex_color: true,
                ..test_default()
            }),
            "mcvu--"
        );
        assert_eq!(
            build_gl_unlit_define_key(&GlUnlitDefineKey {
                vertex_color: true,
                ..flat()
            }),
            "--v---"
        );
    }

    #[test]
    fn encodes_a_non_identity_uv_transform_with_a_u_slot_and_keys_it_distinctly() {
        let transformed = GlUnlitDefineKey {
            has_uv_transform: true,
            ..flat()
        };
        assert_eq!(build_gl_unlit_define_key(&transformed), "---u--");
        assert_ne!(build_gl_unlit_define_key(&transformed), build_gl_unlit_define_key(&flat()));
    }

    #[test]
    fn encodes_the_skinned_variant_with_a_trailing_k_and_keys_it_distinctly() {
        let skinned = GlUnlitDefineKey {
            has_skin: Some(true),
            ..flat()
        };
        assert_eq!(build_gl_unlit_define_key(&skinned), "----k-");
        assert_ne!(build_gl_unlit_define_key(&skinned), build_gl_unlit_define_key(&flat()));
    }
}

mod compile_gl_unlit_program {
    use super::*;

    #[test]
    fn compiles_links_and_resolves_the_unlit_uniforms_with_a_null_normal_matrix() {
        let state = make_gl_scene3d_state();
        let program = compile_gl_unlit_program(&state.gl, &flat(), None);
        assert!(program.loc_color.is_some());
        assert!(program.loc_intensity.is_some());
        assert!(program.loc_normal_matrix.is_none());
        assert!(count_calls("link_program") > 0);
    }
}

mod ensure_gl_unlit_program {
    use super::*;

    #[test]
    fn caches_a_variant_under_the_unlit_namespace_and_reuses_it() {
        let state = make_gl_scene3d_state();
        let first = ensure_gl_unlit_program(&state, &flat());
        let links = count_calls("link_program");
        let second = ensure_gl_unlit_program(&state, &flat());
        assert!(Rc::ptr_eq(&second, &first));
        assert_eq!(count_calls("link_program"), links);
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .keys()
                .any(|key| key.starts_with("unlit:"))
        );
    }

    #[test]
    fn compiles_the_skinned_variant_as_a_distinct_cache_entry() {
        let state = make_gl_scene3d_state();
        ensure_gl_unlit_program(&state, &flat());
        get_gl_scene3d_runtime(&state).active_skinned_run = true;
        ensure_gl_unlit_program(&state, &flat());
        let keys: Vec<String> = get_gl_scene3d_runtime(&state).program_cache.keys().cloned().collect();
        assert!(keys.iter().any(|key| key.starts_with("unlit:") && key.contains('k')));
        assert_eq!(keys.iter().filter(|key| key.starts_with("unlit:")).count(), 2);
    }
}

mod get_gl_unlit_fragment_source_for_key {
    use super::*;

    #[test]
    fn includes_feature_defines_only_when_their_flag_is_set() {
        assert!(!get_gl_unlit_fragment_source_for_key(&flat()).contains("#define HAS_COLOR_MAP"));
        assert!(
            get_gl_unlit_fragment_source_for_key(&GlUnlitDefineKey {
                has_color_map: true,
                ..flat()
            })
            .contains("#define HAS_COLOR_MAP")
        );
        assert!(
            get_gl_unlit_fragment_source_for_key(&GlUnlitDefineKey {
                alpha_mask_enabled: true,
                ..flat()
            })
            .contains("#define ALPHA_MASK")
        );
    }
}

mod get_gl_unlit_vertex_source_for_key {
    use super::*;

    #[test]
    fn defines_vertex_color_only_in_the_vertex_color_variant() {
        let vertex_color = GlUnlitDefineKey {
            vertex_color: true,
            ..flat()
        };
        assert!(!get_gl_unlit_vertex_source_for_key(&flat(), None).contains("#define VERTEX_COLOR"));
        assert!(get_gl_unlit_vertex_source_for_key(&vertex_color, None).contains("#define VERTEX_COLOR"));
        // The color0 attribute lives behind the #ifdef, so it is present in the body string either way.
        assert!(get_gl_unlit_vertex_source_for_key(&vertex_color, None).contains("a_color0"));
    }

    #[test]
    fn defines_has_uv_transform_and_applies_the_transform_only_in_the_uv_transform_variant() {
        // applyUvTransform is always in the body (identity when undefined); the define + uniform are gated.
        assert!(!get_gl_unlit_vertex_source_for_key(&flat(), None).contains("#define HAS_UV_TRANSFORM"));
        let transformed = get_gl_unlit_vertex_source_for_key(
            &GlUnlitDefineKey {
                has_color_map: true,
                has_uv_transform: true,
                ..flat()
            },
            None,
        );
        assert!(transformed.contains("#define HAS_UV_TRANSFORM"));
        assert!(transformed.contains("uniform mat3 u_uvTransform"));
        assert!(transformed.contains("v_uv0 = applyUvTransform(a_uv0)"));
    }

    #[test]
    fn splices_the_skin_declarations_and_has_skin_defines_only_in_the_skinned_variant() {
        let skinned = get_gl_unlit_vertex_source_for_key(
            &GlUnlitDefineKey {
                has_skin: Some(true),
                ..flat()
            },
            Some(GL_SKIN_VERTEX_DECLARATIONS_GLSL),
        );
        assert!(skinned.contains("#define HAS_SKIN"));
        assert!(!skinned.contains("#define MAX_JOINTS"));
        assert!(skinned.contains("sampler2D u_jointTexture"));
        assert!(skinned.contains("texelFetch"));
        assert!(skinned.contains("mat4 skinMatrix()"));
        assert!(skinned.contains("a_joints0"));
        let flat = get_gl_unlit_vertex_source_for_key(&flat(), None);
        assert!(!flat.contains("#define HAS_SKIN"));
        assert!(!flat.contains("a_joints0"));
    }
}
