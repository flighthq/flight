use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::Ref;
use flight_materials::{Material3D, MaterialAlphaMode, StandardPbrMaterialProperties};
use flight_render_gl::{GlRenderState, resolve_gl_texture};
use flight_texture::{Texture, has_texture_uv_transform};
use glow::{HasContext, NativeUniformLocation};

use crate::gl_mesh_program::bind_gl_uv_transform;
use crate::types::{GlPbrDefineKey, GlPbrProgram};

// The texture-unit assignment for the StandardPbrMaterialProperties block. Units 0–5 are reserved
// for the standard maps so every PBR program (StandardPbr and every extension) binds them at the
// same slots; extension renderers bind their own maps at GL_PBR_EXTENSION_TEXTURE_UNIT and above.
pub const GL_PBR_BASE_COLOR_TEXTURE_UNIT: u32 = 0;
pub const GL_PBR_NORMAL_TEXTURE_UNIT: u32 = 1;
pub const GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT: u32 = 2;
pub const GL_PBR_OCCLUSION_TEXTURE_UNIT: u32 = 3;
pub const GL_PBR_EMISSIVE_TEXTURE_UNIT: u32 = 4;
pub const GL_PBR_ALPHA_TEXTURE_UNIT: u32 = 5;

// The first texture unit free for an extension's own maps (clearcoat, sheen, etc.), past the six
// standard-block units. Extension renderers number their maps from here.
pub const GL_PBR_EXTENSION_TEXTURE_UNIT: u32 = 6;

// Uploads the full StandardPbrMaterialProperties block to a PBR program: the base-color/metallic/
// roughness/normal/occlusion/emissive scalars and colors, plus each present map bound at its fixed
// standard texture unit (0–5). StandardPbr passes its properties view; every extension renderer
// passes `material.standard`. A None block uploads neutral defaults (white base color, dielectric,
// fully rough) so a missing material renders plausibly. Packed colors are decoded to linear on the
// CPU here; Texture.color_space selects the GPU sample-time decode for maps, so nothing is
// double-decoded. The alpha-cutoff uniform is NOT part of the block — it lives on the Material3D
// trailer, so each renderer uploads it from the material after this call. Call after
// begin_gl_mesh_draw has selected the program.
pub fn bind_gl_pbr_standard_block(
    state: &mut GlRenderState,
    program: &GlPbrProgram,
    standard: Option<&StandardPbrMaterialProperties>,
) {
    let gl = state.gl.clone();
    let Some(standard) = standard else {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            gl.uniform_4_f32(program.loc_base_color.as_ref(), 1.0, 1.0, 1.0, 1.0);
            gl.uniform_1_f32(program.loc_metallic.as_ref(), 0.0);
            gl.uniform_1_f32(program.loc_roughness.as_ref(), 1.0);
            gl.uniform_1_f32(program.loc_normal_scale.as_ref(), 1.0);
            gl.uniform_3_f32(program.loc_emissive.as_ref(), 0.0, 0.0, 0.0);
            gl.uniform_1_f32(program.loc_emissive_strength.as_ref(), 1.0);
            gl.uniform_1_f32(program.loc_occlusion_strength.as_ref(), 1.0);
        }
        return;
    };

    let mut rgba = allocate_linear_color();
    unpack_color_to_linear(&mut rgba, standard.base_color);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_4_f32(
            program.loc_base_color.as_ref(),
            rgba.r,
            rgba.g,
            rgba.b,
            rgba.a,
        );
        gl.uniform_1_f32(program.loc_metallic.as_ref(), standard.metallic);
        gl.uniform_1_f32(program.loc_roughness.as_ref(), standard.roughness);
        gl.uniform_1_f32(program.loc_normal_scale.as_ref(), standard.normal_scale);
        gl.uniform_1_f32(
            program.loc_occlusion_strength.as_ref(),
            standard.occlusion_strength,
        );
    }

    unpack_color_to_linear(&mut rgba, standard.emissive);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_3_f32(program.loc_emissive.as_ref(), rgba.r, rgba.g, rgba.b);
        gl.uniform_1_f32(
            program.loc_emissive_strength.as_ref(),
            standard.emissive_strength,
        );
    }

    bind_gl_pbr_standard_texture(
        state,
        standard.base_color_map.as_ref(),
        program.loc_base_color_map,
        GL_PBR_BASE_COLOR_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.normal_map.as_ref(),
        program.loc_normal_map,
        GL_PBR_NORMAL_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.metallic_roughness_map.as_ref(),
        program.loc_metallic_roughness_map,
        GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.occlusion_map.as_ref(),
        program.loc_occlusion_map,
        GL_PBR_OCCLUSION_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.emissive_map.as_ref(),
        program.loc_emissive_map,
        GL_PBR_EMISSIVE_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.alpha_map.as_ref(),
        program.loc_alpha_map,
        GL_PBR_ALPHA_TEXTURE_UNIT,
    );
    // The base-color map's uv transform drives the shared v_uv0 that every standard map samples.
    match standard.base_color_map.as_ref() {
        Some(texture) => bind_gl_uv_transform(&gl, program, Some(&*texture.read().unwrap())),
        None => bind_gl_uv_transform(&gl, program, None),
    }
}

// Binds one texture to a numbered unit and points its sampler uniform there, if the slot has
// pixels. The shared per-map helper for both the standard block and extension renderers (they pass
// their own unit ≥ GL_PBR_EXTENSION_TEXTURE_UNIT). No-op when the slot is empty, so the shader's
// untextured #ifdef branch governs instead.
pub fn bind_gl_pbr_standard_texture(
    state: &mut GlRenderState,
    texture: Option<&Ref<Texture>>,
    location: Option<NativeUniformLocation>,
    unit: u32,
) {
    let Some(texture) = texture else {
        return;
    };
    let gl = state.gl.clone();
    // SAFETY: unit selection runs on the owning GL thread.
    unsafe { gl.active_texture(glow::TEXTURE0 + unit) };
    if resolve_gl_texture(state, &*texture.read().unwrap(), None, None).is_none() {
        return;
    }
    // SAFETY: the program is bound on the owning GL thread.
    unsafe { gl.uniform_1_i32(location.as_ref(), unit as i32) };
}

// Builds a GlPbrDefineKey with the standard-block map flags from `standard` and the alpha-mask flag
// from `surface`'s trailer, with every extension lobe disabled. Each extension renderer calls this and
// then ORs in its own extension flag; the StandardPbr renderer uses it as-is. Keeps the map-present
// test (is_gl_texture_ready) in one place so the compiled variant and the bound textures never
// disagree. Takes the whole surface material so it can read `alpha_mode` for both the mask flag and
// the alpha-map gate.
pub fn build_gl_pbr_standard_define_key(
    state: &mut GlRenderState,
    standard: Option<&StandardPbrMaterialProperties>,
    surface: Option<&dyn Material3D>,
) -> GlPbrDefineKey {
    let base_color_map = standard.and_then(|standard| standard.base_color_map.as_ref());
    let alpha_mode = surface.map_or(MaterialAlphaMode::Opaque, |surface| {
        surface.material3d_fields().alpha_mode
    });
    let has_base_color_map = is_gl_texture_ready(state, base_color_map);
    return GlPbrDefineKey {
        alpha_mask_enabled: alpha_mode == MaterialAlphaMode::Mask,
        // An opaque material ignores coverage (Material3D contract), so it must not sample the alpha
        // map; only Mask/Blend do. Same is_gl_texture_ready predicate as the bind path.
        has_alpha_map: alpha_mode != MaterialAlphaMode::Opaque
            && is_gl_texture_ready(
                state,
                standard.and_then(|standard| standard.alpha_map.as_ref()),
            ),
        has_base_color_map,
        has_emissive_map: is_gl_texture_ready(
            state,
            standard.and_then(|standard| standard.emissive_map.as_ref()),
        ),
        has_metallic_roughness_map: is_gl_texture_ready(
            state,
            standard.and_then(|standard| standard.metallic_roughness_map.as_ref()),
        ),
        has_normal_map: is_gl_texture_ready(
            state,
            standard.and_then(|standard| standard.normal_map.as_ref()),
        ),
        has_occlusion_map: is_gl_texture_ready(
            state,
            standard.and_then(|standard| standard.occlusion_map.as_ref()),
        ),
        // Gated on the same readiness test as has_base_color_map so the transforming variant compiles
        // only when the base map is actually bound and carries a non-identity transform.
        has_uv_transform: base_color_map.is_some_and(|base_color_map| {
            return has_base_color_map
                && has_texture_uv_transform(&*base_color_map.read().unwrap());
        }),
        ..GlPbrDefineKey::default()
    };
}

// True when a texture slot has bound, uploadable pixels (an image resource with a backing source).
// The single predicate the define-key builder and the bind path share, so "map present" means the
// same thing in both places.
pub fn is_gl_texture_ready(state: &mut GlRenderState, texture: Option<&Ref<Texture>>) -> bool {
    return texture.is_some_and(|texture| {
        resolve_gl_texture(state, &*texture.read().unwrap(), None, None).is_some()
    });
}
