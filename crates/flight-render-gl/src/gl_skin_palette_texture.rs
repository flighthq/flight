// flight-lint: allow-file(contract-vocabulary) D17 skin-palette allocation and uploads expose native Result diagnostics

use flight_entity::EntityRuntimeSlot;
use glow::{HasContext, PixelUnpackData};

use crate::{GlRenderState, GlSkinPaletteTexture};

// flight-lint: allow(conform-params) D17 palette ownership is attached to the explicit context state
pub fn create_gl_skin_palette_texture(
    state: &GlRenderState,
) -> Result<GlSkinPaletteTexture, String> {
    // SAFETY: allocation occurs on the state's owning GL thread.
    let texture = unsafe { state.gl.create_texture() }
        .map_err(|error| format!("createGlSkinPaletteTexture: {error}"))?;
    let mut out = GlSkinPaletteTexture {
        runtime: EntityRuntimeSlot::default(),
        joint_capacity: 0,
        texture,
        delete_queue: state
            .context_state
            .runtime_state
            .borrow()
            .delete_queue
            .clone(),
        destroyed: false,
    };
    initialize_gl_skin_palette_texture(&mut out);
    return Ok(out);
}

// flight-lint: allow(conform-params) D17 native construction receives its GL handle from create
pub fn initialize_gl_skin_palette_texture(out: &mut GlSkinPaletteTexture) {
    out.joint_capacity = 0;
    out.destroyed = false;
}

// flight-lint: allow(conform-params) D17 deletion checks the explicit owning context's loss state
pub fn destroy_gl_skin_palette_texture(state: &GlRenderState, palette: &mut GlSkinPaletteTexture) {
    if palette.destroyed {
        return;
    }
    if !state.context_state.runtime_state.borrow().context_lost {
        // SAFETY: the palette belongs to this context and is deleted on its owning thread.
        unsafe { state.gl.delete_texture(palette.texture) };
    }
    palette.destroyed = true;
}

fn f32_bytes(values: &[f32]) -> &[u8] {
    // SAFETY: u8 has alignment one and the returned view has the same lifetime as the input slice.
    return unsafe {
        std::slice::from_raw_parts(values.as_ptr().cast::<u8>(), std::mem::size_of_val(values))
    };
}

fn get_gl_palette_texture_max_width(gl: &glow::Context) -> Result<usize, String> {
    // SAFETY: capability query occurs on the owning GL thread.
    let max_width = unsafe { gl.get_parameter_i32(glow::MAX_TEXTURE_SIZE) };
    if max_width <= 0 {
        return Err("GL MAX_TEXTURE_SIZE must be greater than zero".to_string());
    }
    return Ok(max_width as usize);
}

fn upload_gl_palette_texture_rows(
    gl: &glow::Context,
    data: &[f32],
    total_texels: usize,
    width: usize,
    height: usize,
) {
    for y in 0..height {
        let row_start = y * width;
        let row_texels = width.min(total_texels.saturating_sub(row_start));
        let float_start = row_start * 4;
        let row = &data[float_start..float_start + row_texels * 4];
        // SAFETY: every row slice contains exactly the uploaded RGBA32F texels.
        unsafe {
            gl.tex_sub_image_2d(
                glow::TEXTURE_2D,
                0,
                0,
                y as i32,
                row_texels as i32,
                1,
                glow::RGBA,
                glow::FLOAT,
                PixelUnpackData::Slice(Some(f32_bytes(row))),
            );
        }
    }
}

// flight-lint: allow(conform-params) D17 state carries the native GL owner and upload shadow state
// flight-lint: allow(conform-array) D17 a borrowed f32 slice is the native zero-copy analogue of the source Float32Array matrix payload
pub fn upload_gl_skin_palette_texture(
    state: &GlRenderState,
    palette: &mut GlSkinPaletteTexture,
    joint_matrices: &[f32],
    joint_count: usize,
    texels_per_joint: Option<usize>,
) -> Result<(), String> {
    if palette.destroyed {
        return Err("GlSkinPaletteTexture has been destroyed".to_string());
    }
    let texels_per_joint = texels_per_joint.unwrap_or(4);
    let total_texels = joint_count.saturating_mul(texels_per_joint);
    let required_floats = total_texels.saturating_mul(4);
    if joint_matrices.len() < required_floats {
        return Err(format!(
            "uploadGlSkinPaletteTexture: expected {required_floats} floats, received {}",
            joint_matrices.len()
        ));
    }
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .unpack_premultiply_alpha = false;
    // SAFETY: the texture belongs to the current context and all byte views live through their calls.
    unsafe {
        state
            .gl
            .bind_texture(glow::TEXTURE_2D, Some(palette.texture));
    }
    if joint_count > palette.joint_capacity {
        let max_width = get_gl_palette_texture_max_width(&state.gl)?;
        let width = total_texels.min(max_width);
        let height = total_texels.div_ceil(width);
        if height == 1 {
            let data = f32_bytes(&joint_matrices[..required_floats]);
            // SAFETY: the bound texture accepts an RGBA32F payload of exactly width texels.
            unsafe {
                state.gl.tex_image_2d(
                    glow::TEXTURE_2D,
                    0,
                    glow::RGBA32F as i32,
                    width as i32,
                    1,
                    0,
                    glow::RGBA,
                    glow::FLOAT,
                    PixelUnpackData::Slice(Some(data)),
                );
            }
        } else {
            // SAFETY: null allocation establishes the complete rectangular RGBA32F store.
            unsafe {
                state.gl.tex_image_2d(
                    glow::TEXTURE_2D,
                    0,
                    glow::RGBA32F as i32,
                    width as i32,
                    height as i32,
                    0,
                    glow::RGBA,
                    glow::FLOAT,
                    PixelUnpackData::Slice(None),
                );
            }
            upload_gl_palette_texture_rows(&state.gl, joint_matrices, total_texels, width, height);
        }
        // SAFETY: sampler policy applies to the still-bound palette texture.
        unsafe {
            state.gl.tex_parameter_i32(
                glow::TEXTURE_2D,
                glow::TEXTURE_MIN_FILTER,
                glow::NEAREST as i32,
            );
            state.gl.tex_parameter_i32(
                glow::TEXTURE_2D,
                glow::TEXTURE_MAG_FILTER,
                glow::NEAREST as i32,
            );
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
        }
        palette.joint_capacity = joint_count;
    } else {
        let max_width = get_gl_palette_texture_max_width(&state.gl)?;
        let allocated_texels = palette.joint_capacity.saturating_mul(texels_per_joint);
        let width = allocated_texels.min(max_width);
        if total_texels <= width {
            upload_gl_palette_texture_rows(&state.gl, joint_matrices, total_texels, width, 1);
        } else {
            let height = total_texels.div_ceil(width);
            upload_gl_palette_texture_rows(&state.gl, joint_matrices, total_texels, width, height);
        }
    }
    return Ok(());
}
