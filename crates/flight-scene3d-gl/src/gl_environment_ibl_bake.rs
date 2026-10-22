use flight_render_gl::GlRenderState;
use glow::{HasContext, NativeTexture};

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::types::GlScene3DIbl;

pub const IBL_IRRADIANCE_SIZE: u32 = 32;
pub const IBL_PREFILTERED_SIZE: u32 = 128;
pub const IBL_PREFILTERED_MIP_LEVELS: u32 = 5;
pub const IBL_BRDF_LUT_SIZE: u32 = 256;

fn create_cube_texture(gl: &glow::Context, size: u32, internal_format: u32) -> NativeTexture {
    let texture = unsafe { gl.create_texture().unwrap() };
    unsafe {
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture));
        for face in 0..6u32 {
            gl.tex_image_2d(
                glow::TEXTURE_CUBE_MAP_POSITIVE_X + face,
                0,
                internal_format as i32,
                size as i32,
                size as i32,
                0,
                glow::RGBA,
                glow::FLOAT,
                glow::PixelUnpackData::Slice(None),
            );
        }
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MIN_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MAG_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_S, glow::CLAMP_TO_EDGE as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_T, glow::CLAMP_TO_EDGE as i32);
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, None);
    }
    return texture;
}

fn bake_brdf_lut(gl: &glow::Context, _framebuffer: glow::NativeFramebuffer) -> NativeTexture {
    let texture = unsafe { gl.create_texture().unwrap() };
    unsafe {
        gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            glow::RG16F as i32,
            IBL_BRDF_LUT_SIZE as i32,
            IBL_BRDF_LUT_SIZE as i32,
            0,
            glow::RG,
            glow::FLOAT,
            glow::PixelUnpackData::Slice(None),
        );
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MIN_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MAG_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_WRAP_S, glow::CLAMP_TO_EDGE as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_WRAP_T, glow::CLAMP_TO_EDGE as i32);
        gl.bind_texture(glow::TEXTURE_2D, None);
    }
    return texture;
}

pub fn bake_gl_environment_ibl(state: &GlRenderState) {
    let source_cube = get_gl_scene3d_runtime(state, |rt| rt.environment_source_cube);
    let source_cube = match source_cube {
        Some(c) => c,
        None => return,
    };

    let gl = &state.gl;

    let framebuffer = get_gl_scene3d_runtime(state, |rt| rt.ibl_bake_framebuffer);
    let framebuffer = match framebuffer {
        Some(fb) => fb,
        None => {
            let fb = unsafe { gl.create_framebuffer().unwrap() };
            get_gl_scene3d_runtime_mut(state, |rt| {
                rt.ibl_bake_framebuffer = Some(fb);
            });
            fb
        }
    };

    let irradiance_cube = bake_irradiance_cube(gl, framebuffer, source_cube);
    let prefiltered_cube = bake_prefiltered_cube(gl, framebuffer, source_cube);
    let brdf_lut = bake_brdf_lut(gl, framebuffer);

    get_gl_scene3d_runtime_mut(state, |rt| {
        if let Some(ref old) = rt.ibl {
            unsafe {
                gl.delete_texture(old.irradiance_cube);
                gl.delete_texture(old.prefiltered_cube);
                gl.delete_texture(old.brdf_lut);
            }
        }
        rt.ibl = Some(GlScene3DIbl {
            brdf_lut,
            irradiance_cube,
            prefiltered_cube,
        });
    });
}

fn bake_irradiance_cube(
    gl: &glow::Context,
    _framebuffer: glow::NativeFramebuffer,
    _source: NativeTexture,
) -> NativeTexture {
    return create_cube_texture(gl, IBL_IRRADIANCE_SIZE, glow::RGBA16F);
}

fn bake_prefiltered_cube(
    gl: &glow::Context,
    _framebuffer: glow::NativeFramebuffer,
    _source: NativeTexture,
) -> NativeTexture {
    let texture = unsafe { gl.create_texture().unwrap() };
    unsafe {
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture));
        for face in 0..6u32 {
            for mip in 0..IBL_PREFILTERED_MIP_LEVELS {
                let size = (IBL_PREFILTERED_SIZE >> mip).max(1);
                gl.tex_image_2d(
                    glow::TEXTURE_CUBE_MAP_POSITIVE_X + face,
                    mip as i32,
                    glow::RGBA16F as i32,
                    size as i32,
                    size as i32,
                    0,
                    glow::RGBA,
                    glow::FLOAT,
                    glow::PixelUnpackData::Slice(None),
                );
            }
        }
        gl.tex_parameter_i32(
            glow::TEXTURE_CUBE_MAP,
            glow::TEXTURE_MIN_FILTER,
            glow::LINEAR_MIPMAP_LINEAR as i32,
        );
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MAG_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_S, glow::CLAMP_TO_EDGE as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_T, glow::CLAMP_TO_EDGE as i32);
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, None);
    }
    return texture;
}

pub fn destroy_gl_environment_ibl(state: &GlRenderState) {
    let gl = &state.gl;
    get_gl_scene3d_runtime_mut(state, |rt| {
        if let Some(ref ibl) = rt.ibl {
            unsafe {
                gl.delete_texture(ibl.irradiance_cube);
                gl.delete_texture(ibl.prefiltered_cube);
                gl.delete_texture(ibl.brdf_lut);
            }
        }
        rt.ibl = None;
        if let Some(fb) = rt.ibl_bake_framebuffer {
            unsafe { gl.delete_framebuffer(fb); }
        }
        rt.ibl_bake_framebuffer = None;
    });
}
