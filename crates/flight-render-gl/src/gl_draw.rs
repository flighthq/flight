// flight-lint: allow-file(contract-vocabulary) D17 draw code intentionally exposes native glow handles, entity ids, open texture variants, and Result diagnostics

use std::collections::HashMap;
use std::sync::Arc;

use flight_bitmap::Bitmap;
use flight_entity::get_entity_id;
use flight_image::{CompressedImageResource, ImageResource};
use flight_materials::{
    BLEND_MODE_ADD, BLEND_MODE_DARKEN, BLEND_MODE_LIGHTEN, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL,
    BLEND_MODE_SCREEN, BlendMode,
};
use flight_registry::{KindMap, with_kind_map_entry};
use flight_texture::{
    AlphaType, Sampler, TextureColorSpace, TextureFilter, TextureSource, TextureVariant,
    TextureWrap,
};
use glow::HasContext;

use crate::{
    GlBitmapShader, GlBlendEquation, GlBlendFactor, GlBlendRealization, GlBlendSignature,
    GlBoundShader, GlImageSourceToken, GlRenderState, GlTextureCacheEntry, GlTextureRealization,
    ensure_default_gl_bitmap_shader, set_gl_attributes, set_gl_matrix_from_values,
    upload_gl_texture_data, upload_gl_texture_element_premultiplied,
    upload_gl_texture_image_resource,
};

pub fn create_gl_texture(state: &GlRenderState) -> Result<glow::NativeTexture, String> {
    // SAFETY: allocation occurs on the current GL thread.
    let texture = unsafe { state.gl.create_texture() }
        .map_err(|error| format!("createGlTexture: {error}"))?;
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha: false,
            texture,
        }),
    );
    apply_gl_sampler_state(state, texture, None, None);
    return Ok(texture);
}

pub fn apply_gl_blend_mode(state: &mut GlRenderState, blend_mode: Option<&BlendMode>) {
    let realization = blend_mode
        .and_then(|mode| state.gl_registries.blend_realizations.entries.get(mode))
        .copied()
        .unwrap_or(normal_gl_blend_realization());
    let signature = GlBlendSignature {
        dst: gl_blend_factor(realization.dst),
        equation: gl_blend_equation(realization.equation.unwrap_or_default()),
        src: gl_blend_factor(realization.src),
    };
    let mut context = state.context_state.runtime_state.borrow_mut();
    if context.current_blend_signature == Some(signature) {
        return;
    }
    // SAFETY: fixed-function state is mutated on the owning GL thread.
    unsafe {
        state.gl.blend_equation(signature.equation);
        state.gl.blend_func(signature.src, signature.dst);
    }
    context.current_blend_signature = Some(signature);
}

// flight-lint: allow(conform-params) D17 native GL state owns the runtime cache that the source passes explicitly
pub fn apply_gl_sampler_state(
    state: &GlRenderState,
    texture: glow::NativeTexture,
    sampler: Option<&Sampler>,
    smoothing_override: Option<bool>,
) {
    // SAFETY: the texture is the active TEXTURE_2D binding by this function's contract.
    unsafe {
        let Some(sampler) = sampler else {
            let filter = if smoothing_override.unwrap_or(state.render.allow_smoothing) {
                glow::LINEAR
            } else {
                glow::NEAREST
            };
            state
                .gl
                .tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MIN_FILTER, filter as i32);
            state
                .gl
                .tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MAG_FILTER, filter as i32);
            state.gl.tex_parameter_i32(
                glow::TEXTURE_2D,
                glow::TEXTURE_WRAP_S,
                glow::CLAMP_TO_EDGE as i32,
            );
            state.gl.tex_parameter_i32(
                glow::TEXTURE_2D,
                glow::TEXTURE_WRAP_T,
                glow::CLAMP_TO_EDGE as i32,
            );
            return;
        };
        let use_mips = sampler.mipmaps && is_gl_mipmap_filter(sampler.min_filter);
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MIN_FILTER,
            gl_min_filter_value(sampler.min_filter, use_mips) as i32,
        );
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MAG_FILTER,
            gl_mag_filter_value(sampler.mag_filter) as i32,
        );
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_S,
            gl_texture_wrap_value(sampler.wrap_u) as i32,
        );
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_T,
            gl_texture_wrap_value(sampler.wrap_v) as i32,
        );

        let anisotropy_supported = {
            let mut context = state.context_state.runtime_state.borrow_mut();
            match context.anisotropy_extension {
                Some(value) => value,
                None => {
                    let value = state
                        .gl
                        .supported_extensions()
                        .contains("GL_EXT_texture_filter_anisotropic")
                        || state
                            .gl
                            .supported_extensions()
                            .contains("EXT_texture_filter_anisotropic");
                    context.anisotropy_extension = Some(value);
                    if value {
                        const MAX_TEXTURE_MAX_ANISOTROPY_EXT: u32 = 0x84ff;
                        context.max_anisotropy = state
                            .gl
                            .get_parameter_f32(MAX_TEXTURE_MAX_ANISOTROPY_EXT)
                            .max(1.0);
                    }
                    value
                }
            }
        };
        if anisotropy_supported {
            const TEXTURE_MAX_ANISOTROPY_EXT: u32 = 0x84fe;
            let maximum = state.context_state.runtime_state.borrow().max_anisotropy;
            state.gl.tex_parameter_f32(
                glow::TEXTURE_2D,
                TEXTURE_MAX_ANISOTROPY_EXT,
                sampler.anisotropy.max(1.0).min(maximum),
            );
        }
        if use_mips {
            let needs_generation = !state
                .context_state
                .runtime_state
                .borrow()
                .texture_caches
                .mipmapped
                .contains(&texture);
            if needs_generation {
                state.gl.generate_mipmap(glow::TEXTURE_2D);
                state
                    .context_state
                    .runtime_state
                    .borrow_mut()
                    .texture_caches
                    .mipmapped
                    .insert(texture);
            }
        }
    }
}

pub fn bind_gl_bitmap_texture(
    state: &GlRenderState,
    bitmap: &Bitmap,
    sampler: Option<&Sampler>,
    smoothing_override: Option<bool>,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Result<glow::NativeTexture, String> {
    return bind_gl_texture_source_texture(
        state,
        bitmap,
        sampler,
        smoothing_override,
        premultiply,
        false,
        color_space,
        |state, image, premultiply, color_space| {
            let image = (image as &dyn std::any::Any)
                .downcast_ref::<Bitmap>()
                .expect("bitmap resolver source");
            upload_gl_bitmap(state, image, premultiply, color_space);
            Ok(())
        },
    );
}

pub fn bind_gl_compressed_image_texture(
    state: &GlRenderState,
    image: &CompressedImageResource,
    sampler: Option<&Sampler>,
    smoothing_override: Option<bool>,
    color_space: TextureColorSpace,
) -> Result<glow::NativeTexture, String> {
    return bind_gl_texture_source_texture(
        state,
        image,
        sampler,
        smoothing_override,
        false,
        true,
        color_space,
        |state, image, _premultiply, color_space| {
            let image = (image as &dyn std::any::Any)
                .downcast_ref::<CompressedImageResource>()
                .expect("compressed-image resolver source");
            if let Some(upload) = state.gl_registries.compressed_texture_upload {
                upload(
                    &state.gl,
                    image,
                    state.gl_registries.compressed_texture_decoder,
                    color_space,
                );
            }
            Ok(())
        },
    );
}

pub fn bind_gl_image_resource_texture(
    state: &GlRenderState,
    image: &ImageResource,
    sampler: Option<&Sampler>,
    smoothing_override: Option<bool>,
    premultiply: bool,
    color_space: TextureColorSpace,
) -> Result<glow::NativeTexture, String> {
    return bind_gl_texture_source_texture(
        state,
        image,
        sampler,
        smoothing_override,
        premultiply,
        false,
        color_space,
        |state, image, premultiply, color_space| {
            let image = (image as &dyn std::any::Any)
                .downcast_ref::<ImageResource>()
                .expect("image resolver source");
            let should_premultiply = premultiply && image.alpha_type != AlphaType::Premultiplied;
            state
                .context_state
                .runtime_state
                .borrow_mut()
                .unpack_premultiply_alpha = should_premultiply;
            let internal_format = Some(if color_space == TextureColorSpace::Srgb {
                glow::SRGB8_ALPHA8
            } else {
                glow::RGBA
            });
            if should_premultiply {
                let Some(source) = image
                    .source
                    .handle
                    .as_ref()
                    .downcast_ref::<GlImageSourceToken>()
                else {
                    return Err(
                        "uploadGlTextureImageResource: host image is not a GlImageSourceToken"
                            .to_string(),
                    );
                };
                upload_gl_texture_element_premultiplied(
                    &state.gl,
                    glow::TEXTURE_2D,
                    source,
                    internal_format,
                );
                return Ok(());
            }
            return upload_gl_texture_image_resource(
                &state.gl,
                glow::TEXTURE_2D,
                image,
                internal_format,
            );
        },
    );
}

// flight-lint: allow(conform-params) D17 native texture cache identity is an explicit source entity id
pub fn bind_gl_texture(
    state: &GlRenderState,
    image_source: &GlImageSourceToken,
    source_id: u64,
    sampler: Option<&Sampler>,
) -> Result<glow::NativeTexture, String> {
    let key = (source_id, true, false);
    let cached = state
        .context_state
        .runtime_state
        .borrow()
        .texture_caches
        .by_texture_entity
        .get(&key)
        .copied();
    let texture = if let Some(entry) = cached {
        entry.texture
    } else {
        // SAFETY: allocation occurs on the current GL thread.
        let texture = unsafe { state.gl.create_texture() }
            .map_err(|error| format!("bindGlTexture: {error}"))?;
        bind_gl_texture_realization(
            state,
            Some(GlTextureRealization {
                straight_alpha: false,
                texture,
            }),
        );
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .unpack_premultiply_alpha = true;
        upload_gl_texture_element_premultiplied(
            &state.gl,
            glow::TEXTURE_2D,
            image_source,
            Some(glow::RGBA),
        );
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .texture_caches
            .by_texture_entity
            .insert(
                key,
                GlTextureCacheEntry {
                    texture,
                    version: 0,
                    straight_alpha: false,
                },
            );
        texture
    };
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha: false,
            texture,
        }),
    );
    apply_gl_sampler_state(state, texture, sampler, None);
    return Ok(texture);
}

pub fn bind_gl_texture_realization(
    state: &GlRenderState,
    realization: Option<GlTextureRealization>,
) -> Option<glow::NativeTexture> {
    // SAFETY: binding occurs on the owning GL thread; the optional handle belongs to this context.
    unsafe {
        state
            .gl
            .bind_texture(glow::TEXTURE_2D, realization.map(|value| value.texture));
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .current_texture_realization = realization;
    return realization.map(|value| value.texture);
}

fn bind_gl_texture_source_texture<F>(
    state: &GlRenderState,
    image: &dyn TextureSource,
    sampler: Option<&Sampler>,
    smoothing_override: Option<bool>,
    premultiply: bool,
    straight_alpha: bool,
    color_space: TextureColorSpace,
    upload: F,
) -> Result<glow::NativeTexture, String>
where
    F: FnOnce(&GlRenderState, &dyn TextureSource, bool, TextureColorSpace) -> Result<(), String>,
{
    let key = (
        get_entity_id(image),
        premultiply,
        color_space == TextureColorSpace::Srgb,
    );
    let cached = state
        .context_state
        .runtime_state
        .borrow()
        .texture_caches
        .by_texture_entity
        .get(&key)
        .copied();
    let mut entry = match cached {
        Some(entry) => entry,
        None => GlTextureCacheEntry {
            // SAFETY: texture allocation occurs on the current GL thread.
            texture: unsafe { state.gl.create_texture() }
                .map_err(|error| format!("bindGlTextureSourceTexture: {error}"))?,
            version: u32::MAX,
            straight_alpha,
        },
    };
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha,
            texture: entry.texture,
        }),
    );
    if entry.version != image.texture_source_fields().version {
        upload(state, image, premultiply, color_space)?;
        entry.version = image.texture_source_fields().version;
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .texture_caches
            .by_texture_entity
            .insert(key, entry);
    }
    apply_gl_sampler_state(state, entry.texture, sampler, smoothing_override);
    return Ok(entry.texture);
}

// flight-lint: allow(conform-params) D17 native video upload receives the resolved frame image explicitly
pub fn bind_gl_video_texture(
    state: &GlRenderState,
    texture: &dyn TextureVariant,
    image: &ImageResource,
    sampler: Option<&Sampler>,
) -> Result<glow::NativeTexture, String> {
    let color_space = texture.texture_fields().color_space;
    let key = (
        get_entity_id(image),
        true,
        color_space == TextureColorSpace::Srgb,
    );
    let entry = state
        .context_state
        .runtime_state
        .borrow()
        .texture_caches
        .by_texture_entity
        .get(&key)
        .copied();
    let mut entry = match entry {
        Some(entry) => entry,
        None => GlTextureCacheEntry {
            // SAFETY: allocation occurs on the current GL thread.
            texture: unsafe { state.gl.create_texture() }
                .map_err(|error| format!("bindGlVideoTexture: {error}"))?,
            version: u32::MAX,
            straight_alpha: false,
        },
    };
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha: false,
            texture: entry.texture,
        }),
    );
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .unpack_premultiply_alpha = true;
    let internal_format = Some(if color_space == TextureColorSpace::Srgb {
        glow::SRGB8_ALPHA8
    } else {
        glow::RGBA
    });
    if image.version != entry.version {
        if let Some(source) = image
            .source
            .handle
            .as_ref()
            .downcast_ref::<GlImageSourceToken>()
        {
            if source.ready && source.width > 0 && source.height > 0 {
                upload_gl_texture_element_premultiplied(
                    &state.gl,
                    glow::TEXTURE_2D,
                    source,
                    internal_format,
                );
                entry.version = image.version;
            }
        }
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .texture_caches
        .by_texture_entity
        .insert(key, entry);
    apply_gl_sampler_state(
        state,
        entry.texture,
        sampler.or(Some(&texture.texture_fields().sampler)),
        None,
    );
    return Ok(entry.texture);
}

// flight-lint: allow(f64, conform-extra) Exact JavaScript ToUint8Clamp and premultiply arithmetic parity is an explicit native upload helper
pub fn convert_rgba8_alpha_encoding(data: &[u8], to_premultiplied: bool) -> Vec<u8> {
    let mut output = vec![0; data.len()];
    for index in (0..data.len()).step_by(4) {
        let Some(alpha) = data.get(index + 3).copied() else {
            output[index..].copy_from_slice(&data[index..]);
            break;
        };
        let scale = if to_premultiplied {
            alpha as f64 / 255.0
        } else if alpha == 0 {
            0.0
        } else {
            255.0 / alpha as f64
        };
        output[index] = to_uint8_clamp(data[index] as f64 * scale);
        output[index + 1] = to_uint8_clamp(data[index + 1] as f64 * scale);
        output[index + 2] = to_uint8_clamp(data[index + 2] as f64 * scale);
        output[index + 3] = alpha;
    }
    return output;
}

fn default_gl_blend_modes() -> [(&'static str, GlBlendRealization); 6] {
    return [
        (
            BLEND_MODE_ADD,
            GlBlendRealization {
                src: GlBlendFactor::One,
                dst: GlBlendFactor::One,
                equation: None,
            },
        ),
        (
            BLEND_MODE_DARKEN,
            GlBlendRealization {
                src: GlBlendFactor::One,
                dst: GlBlendFactor::One,
                equation: Some(GlBlendEquation::Min),
            },
        ),
        (
            BLEND_MODE_LIGHTEN,
            GlBlendRealization {
                src: GlBlendFactor::One,
                dst: GlBlendFactor::One,
                equation: Some(GlBlendEquation::Max),
            },
        ),
        (
            BLEND_MODE_MULTIPLY,
            GlBlendRealization {
                src: GlBlendFactor::DstColor,
                dst: GlBlendFactor::OneMinusSrcAlpha,
                equation: None,
            },
        ),
        (BLEND_MODE_NORMAL, normal_gl_blend_realization()),
        (
            BLEND_MODE_SCREEN,
            GlBlendRealization {
                src: GlBlendFactor::One,
                dst: GlBlendFactor::OneMinusSrcColor,
                equation: None,
            },
        ),
    ];
}

#[allow(clippy::too_many_arguments)]
pub fn draw_gl_quad(
    state: &GlRenderState,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) -> Result<(), String> {
    let vertices = [
        x0, y0, u0, v0, x1, y0, u1, v0, x1, y1, u1, v1, x0, y1, u0, v1,
    ];
    state.gl_runtime.borrow_mut().quad_vertex_data = vertices;
    let bytes = vertices
        .iter()
        .flat_map(|value| value.to_ne_bytes())
        .collect::<Vec<_>>();
    let (vertex_buffer, index_buffer, locations) = {
        let context = state.context_state.runtime_state.borrow();
        (
            context
                .quad_vertex_buffer
                .ok_or_else(|| "drawGlQuad: vertex buffer is unavailable".to_string())?,
            context
                .quad_index_buffer
                .ok_or_else(|| "drawGlQuad: index buffer is unavailable".to_string())?,
            context
                .binding
                .as_ref()
                .and_then(|binding| binding.locations.clone())
                .ok_or_else(|| "drawGlQuad: current shader has no bitmap locations".to_string())?,
        )
    };
    // SAFETY: the shared quad buffers and linked shader locations belong to this context.
    unsafe {
        state
            .gl
            .bind_buffer(glow::ARRAY_BUFFER, Some(vertex_buffer));
        state
            .gl
            .buffer_sub_data_u8_slice(glow::ARRAY_BUFFER, 0, &bytes);
        state
            .gl
            .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(index_buffer));
        set_gl_attributes(&state.gl, &locations);
        state
            .gl
            .draw_elements(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0);
    }
    state.gl_runtime.borrow_mut().stats.draw_calls += 1;
    return Ok(());
}

pub fn enable_gl_blend_mode_support(state: &mut GlRenderState) {
    register_default_gl_blend_modes(state);
    state.apply_blend_mode = Some(apply_gl_blend_mode);
}

fn gl_blend_equation(equation: GlBlendEquation) -> u32 {
    return match equation {
        GlBlendEquation::FuncAdd => glow::FUNC_ADD,
        GlBlendEquation::FuncReverseSubtract => glow::FUNC_REVERSE_SUBTRACT,
        GlBlendEquation::Max => glow::MAX,
        GlBlendEquation::Min => glow::MIN,
    };
}

fn gl_blend_factor(factor: GlBlendFactor) -> u32 {
    return match factor {
        GlBlendFactor::DstColor => glow::DST_COLOR,
        GlBlendFactor::One => glow::ONE,
        GlBlendFactor::OneMinusSrcAlpha => glow::ONE_MINUS_SRC_ALPHA,
        GlBlendFactor::OneMinusSrcColor => glow::ONE_MINUS_SRC_COLOR,
        GlBlendFactor::Zero => glow::ZERO,
    };
}

fn gl_mag_filter_value(filter: TextureFilter) -> u32 {
    return match filter {
        TextureFilter::Nearest
        | TextureFilter::NearestMipmapLinear
        | TextureFilter::NearestMipmapNearest => glow::NEAREST,
        _ => glow::LINEAR,
    };
}

fn gl_min_filter_value(filter: TextureFilter, use_mips: bool) -> u32 {
    if !use_mips {
        return gl_mag_filter_value(filter);
    }
    return match filter {
        TextureFilter::LinearMipmapLinear => glow::LINEAR_MIPMAP_LINEAR,
        TextureFilter::LinearMipmapNearest => glow::LINEAR_MIPMAP_NEAREST,
        TextureFilter::NearestMipmapLinear => glow::NEAREST_MIPMAP_LINEAR,
        TextureFilter::NearestMipmapNearest => glow::NEAREST_MIPMAP_NEAREST,
        TextureFilter::Nearest => glow::NEAREST,
        _ => glow::LINEAR,
    };
}

fn gl_texture_wrap_value(wrap: TextureWrap) -> u32 {
    return match wrap {
        TextureWrap::Repeat => glow::REPEAT,
        TextureWrap::MirrorRepeat => glow::MIRRORED_REPEAT,
        TextureWrap::ClampToEdge => glow::CLAMP_TO_EDGE,
    };
}

pub fn is_blend_mode_supported(state: &GlRenderState, blend_mode: &BlendMode) -> bool {
    return state
        .gl_registries
        .blend_realizations
        .entries
        .contains_key(blend_mode);
}

fn is_gl_mipmap_filter(filter: TextureFilter) -> bool {
    return !matches!(filter, TextureFilter::Linear | TextureFilter::Nearest);
}

fn normal_gl_blend_realization() -> GlBlendRealization {
    return GlBlendRealization {
        src: GlBlendFactor::One,
        dst: GlBlendFactor::OneMinusSrcAlpha,
        equation: None,
    };
}

pub fn register_default_gl_blend_modes(state: &mut GlRenderState) {
    for (mode, realization) in default_gl_blend_modes() {
        register_gl_blend_mode(state, mode.to_string(), realization);
    }
}

pub fn register_gl_blend_mode(
    state: &mut GlRenderState,
    blend_mode: BlendMode,
    realization: GlBlendRealization,
) {
    state.gl_registries.blend_realizations = Arc::new(with_kind_map_entry(
        &state.gl_registries.blend_realizations,
        blend_mode,
        realization,
    ));
}

#[allow(clippy::too_many_arguments)]
pub fn set_gl_quad_matrix_from_offset(
    state: &GlRenderState,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
    dx: f32,
    dy: f32,
) -> Result<(), String> {
    let locations = state
        .context_state
        .runtime_state
        .borrow()
        .binding
        .as_ref()
        .and_then(|binding| binding.locations.clone())
        .ok_or_else(|| "setGlQuadMatrixFromOffset: current shader has no locations".to_string())?;
    let viewport = state.gl_runtime.borrow().render_target_viewport;
    let (width, height) = viewport.map_or_else(
        || {
            let mut values = [0; 4];
            // SAFETY: viewport query occurs on the owning GL thread.
            unsafe {
                state
                    .gl
                    .get_parameter_i32_slice(glow::VIEWPORT, &mut values)
            };
            (values[2].max(1) as f32, values[3].max(1) as f32)
        },
        |value| (value.width.max(1) as f32, value.height.max(1) as f32),
    );
    set_gl_matrix_from_values(
        &state.gl,
        &locations,
        &mut state.gl_runtime.borrow_mut().matrix_array,
        a,
        b,
        c,
        d,
        tx + a * dx + c * dy,
        ty + b * dx + d * dy,
        width,
        height,
    );
    return Ok(());
}

// flight-lint: allow(conform-extra) D17 caller-owned registry initialization exposes the immutable standard blend table
pub fn standard_gl_blend_realizations() -> KindMap<GlBlendRealization> {
    let mut map = KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
    for (mode, realization) in default_gl_blend_modes() {
        map = with_kind_map_entry(&map, mode.to_string(), realization);
    }
    return map;
}

// flight-lint: allow(f64) This is the source JavaScript ToUint8Clamp operation over Number values
fn to_uint8_clamp(value: f64) -> u8 {
    if value.is_nan() || value <= 0.0 {
        return 0;
    }
    if value >= 255.0 {
        return 255;
    }
    let floor = value.floor();
    let fraction = value - floor;
    if fraction < 0.5 {
        return floor as u8;
    }
    if fraction > 0.5 {
        return floor as u8 + 1;
    }
    return if floor as u8 % 2 == 0 {
        floor as u8
    } else {
        floor as u8 + 1
    };
}

// flight-lint: allow(conform-params) D17 the native image token replaces the browser canvas parameter while preserving update order
pub fn update_gl_texture(
    state: &GlRenderState,
    texture: glow::NativeTexture,
    source: &GlImageSourceToken,
) {
    bind_gl_texture_realization(
        state,
        Some(GlTextureRealization {
            straight_alpha: false,
            texture,
        }),
    );
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .unpack_premultiply_alpha = true;
    upload_gl_texture_element_premultiplied(&state.gl, glow::TEXTURE_2D, source, Some(glow::RGBA));
    if state
        .context_state
        .runtime_state
        .borrow()
        .texture_caches
        .mipmapped
        .contains(&texture)
    {
        // SAFETY: texture remains bound from the call above.
        unsafe { state.gl.generate_mipmap(glow::TEXTURE_2D) };
    }
}

fn upload_gl_bitmap(
    state: &GlRenderState,
    bitmap: &Bitmap,
    premultiply: bool,
    color_space: TextureColorSpace,
) {
    let converted;
    let data = if premultiply && bitmap.alpha_type != AlphaType::Premultiplied {
        converted = convert_rgba8_alpha_encoding(&bitmap.data, true);
        converted.as_slice()
    } else if !premultiply && bitmap.alpha_type == AlphaType::Premultiplied {
        converted = convert_rgba8_alpha_encoding(&bitmap.data, false);
        converted.as_slice()
    } else {
        &bitmap.data
    };
    upload_gl_texture_data(
        &state.gl,
        glow::TEXTURE_2D,
        bitmap.width,
        bitmap.height,
        data,
        Some(if color_space == TextureColorSpace::Srgb {
            glow::SRGB8_ALPHA8
        } else {
            glow::RGBA
        }),
    );
}

pub fn use_gl_program(
    state: &GlRenderState,
    shader: Option<Arc<GlBitmapShader>>,
) -> Result<Arc<GlBitmapShader>, String> {
    let resolved = match shader {
        Some(shader) => shader,
        None => ensure_default_gl_bitmap_shader(state)?,
    };
    let current = state
        .context_state
        .runtime_state
        .borrow()
        .binding
        .as_ref()
        .map(|binding| binding.program);
    if current != Some(resolved.program) {
        // SAFETY: shader program belongs to the current context.
        unsafe { state.gl.use_program(Some(resolved.program)) };
        state.context_state.runtime_state.borrow_mut().binding = Some(GlBoundShader {
            locations: Some(resolved.locations.clone()),
            program: resolved.program,
        });
        state.gl_runtime.borrow_mut().stats.program_switches += 1;
        return Ok(resolved);
    }
    state.context_state.runtime_state.borrow_mut().binding = Some(GlBoundShader {
        locations: Some(resolved.locations.clone()),
        program: resolved.program,
    });
    if let Some(guard) = state.gl_runtime.borrow().binding_cache_guard {
        guard(state, resolved.program);
    }
    return Ok(resolved);
}
