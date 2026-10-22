use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_materials::pbr_materials::{
    create_standard_pbr_material, create_standard_pbr_material_properties,
};
use flight_materials::{MaterialAlphaMode, StandardPbrMaterialPropertiesOptions};
use flight_render::ExternalTexture;
use flight_render_gl::{GlRenderState, GlTextureRealization, register_gl_texture_resolver};
use flight_scene3d_gl::contract::*;
use flight_texture::{
    Texture, TextureColorSpace, TextureSourceRef, TextureVariant, create_texture_2d,
};
use glow::HasContext;

use crate::gl_test_helper::{clear_calls, count_calls, make_gl_scene3d_state, test_default};

// Compiles the neutral standard-block variant on the state's own mock context (TS compiled on a
// separate fake GL; the Rust mock is one per thread), then clears the recorded compile calls.
fn make_program(state: &mut GlRenderState) -> GlPbrProgram {
    let key = build_gl_pbr_standard_define_key(state, None, None);
    let program = compile_gl_pbr_program(&state.gl, &key, None, None, None);
    clear_calls();
    return program;
}

// A texture that reports pixels (is_gl_texture_ready === true) without a real upload.
fn make_ready_texture() -> Ref<Texture> {
    let mut source: ExternalTexture = allocate_entity();
    source.kind = "test.ready".to_string();
    source.width = 1;
    source.height = 1;
    let source: TextureSourceRef = Arc::new(RwLock::new(source));
    let mut texture = create_texture_2d();
    texture.source = Some(source);
    return Arc::new(RwLock::new(Texture::Texture2D(texture)));
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

fn make_texture_ready_state() -> GlRenderState {
    let mut state = make_gl_scene3d_state();
    register_gl_texture_resolver(&mut state, "test.ready".to_string(), Some(ready_resolver));
    return state;
}

fn make_surface(alpha_mode: MaterialAlphaMode) -> flight_materials::StandardPbrMaterial {
    let mut material = create_standard_pbr_material();
    material.alpha_mode = alpha_mode;
    return material;
}

mod bind_gl_pbr_standard_block {
    use super::*;

    #[test]
    fn uploads_neutral_defaults_for_a_null_block() {
        let mut state = make_gl_scene3d_state();
        let program = make_program(&mut state);
        bind_gl_pbr_standard_block(&mut state, &program, None);
        assert!(count_calls("uniform_4_f32") > 0);
        assert!(count_calls("uniform_1_f32") >= 4);
    }

    #[test]
    fn uploads_the_metallic_roughness_scalars_and_emissive_for_a_material_block() {
        let mut state = make_gl_scene3d_state();
        let standard =
            create_standard_pbr_material_properties(Some(&StandardPbrMaterialPropertiesOptions {
                metallic: Some(0.5),
                occlusion_strength: Some(0.3),
                roughness: Some(0.6),
                ..test_default::<StandardPbrMaterialPropertiesOptions>()
            }));
        let program = make_program(&mut state);
        bind_gl_pbr_standard_block(&mut state, &program, Some(&standard));
        assert!(count_calls("uniform_4_f32") > 0);
        assert!(count_calls("uniform_3_f32") > 0);
        assert!(count_calls("uniform_1_f32") >= 4);
        // No textures bound when every map is None.
        assert_eq!(count_calls("active_texture"), 0);
    }
}

mod bind_gl_pbr_standard_texture {
    use super::*;

    #[test]
    fn is_a_no_op_when_the_texture_slot_is_empty() {
        let mut state = make_gl_scene3d_state();
        let program = make_program(&mut state);
        bind_gl_pbr_standard_texture(&mut state, None, program.loc_base_color_map, 0);
        assert_eq!(count_calls("active_texture"), 0);
    }
}

mod build_gl_pbr_standard_define_key {
    use super::*;

    #[test]
    fn propagates_the_alpha_mask_flag_from_the_surface_material() {
        let mut state = make_texture_ready_state();
        let surface = make_surface(MaterialAlphaMode::Mask);
        assert!(
            build_gl_pbr_standard_define_key(&mut state, None, Some(&surface)).alpha_mask_enabled
        );
    }

    #[test]
    fn samples_the_alpha_map_for_mask_blend_but_not_for_an_opaque_material() {
        let mut state = make_texture_ready_state();
        let mut standard = create_standard_pbr_material_properties(None);
        standard.alpha_map = Some(make_ready_texture());
        let mask = make_surface(MaterialAlphaMode::Mask);
        let blend = make_surface(MaterialAlphaMode::Blend);
        let opaque = make_surface(MaterialAlphaMode::Opaque);
        assert!(
            build_gl_pbr_standard_define_key(&mut state, Some(&standard), Some(&mask))
                .has_alpha_map
        );
        assert!(
            build_gl_pbr_standard_define_key(&mut state, Some(&standard), Some(&blend))
                .has_alpha_map
        );
        assert!(
            !build_gl_pbr_standard_define_key(&mut state, Some(&standard), Some(&opaque))
                .has_alpha_map
        );
    }

    #[test]
    fn returns_all_false_standard_map_flags_for_a_null_block() {
        let mut state = make_texture_ready_state();
        let key = build_gl_pbr_standard_define_key(&mut state, None, None);
        assert!(!key.has_alpha_map);
        assert!(!key.has_base_color_map);
        assert!(!key.has_emissive_map);
        assert!(!key.has_metallic_roughness_map);
        assert!(!key.has_occlusion_map);
        assert!(!key.has_uv_transform);
    }
}

mod is_gl_texture_ready {
    use super::*;

    #[test]
    fn is_false_for_a_null_texture() {
        let mut state = make_texture_ready_state();
        assert!(!is_gl_texture_ready(&mut state, None));
    }
}
