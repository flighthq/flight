use flight_render_gl::GlRenderState;
use glow::{HasContext, NativeTexture};

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};

pub fn destroy_gl_environment_source_cube(state: &GlRenderState) {
    let cube = get_gl_scene3d_runtime(state, |rt| rt.environment_source_cube);
    if let Some(cube) = cube {
        unsafe {
            state.gl.delete_texture(cube);
        }
        get_gl_scene3d_runtime_mut(state, |rt| {
            rt.environment_source_cube = None;
            rt.environment_source_cube_color_space = "linear".to_string();
            rt.environment_source_cube_face_versions.clear();
            rt.environment_source_revision = rt.environment_source_revision.wrapping_add(1);
            rt.environment_source_texture = None;
            rt.environment_source_texture_version = -1;
        });
    }
}

pub fn get_gl_cube_face_target(face: u32) -> u32 {
    return glow::TEXTURE_CUBE_MAP_POSITIVE_X + face;
}

pub fn create_gl_environment_cube(
    state: &GlRenderState,
    face_data: &[&[u8]; 6],
    width: u32,
    height: u32,
    srgb: bool,
) -> NativeTexture {
    let gl = &state.gl;
    let internal_format = if srgb { glow::SRGB8_ALPHA8 } else { glow::RGBA8 };

    let texture = unsafe { gl.create_texture().unwrap() };
    unsafe {
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture));
        for face in 0..6u32 {
            gl.tex_image_2d(
                get_gl_cube_face_target(face),
                0,
                internal_format as i32,
                width as i32,
                height as i32,
                0,
                glow::RGBA,
                glow::UNSIGNED_BYTE,
                glow::PixelUnpackData::Slice(Some(face_data[face as usize])),
            );
        }
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MIN_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_MAG_FILTER, glow::LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_S, glow::CLAMP_TO_EDGE as i32);
        gl.tex_parameter_i32(glow::TEXTURE_CUBE_MAP, glow::TEXTURE_WRAP_T, glow::CLAMP_TO_EDGE as i32);
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, None);
    }

    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.environment_source_cube = Some(texture);
        rt.environment_source_cube_color_space = if srgb { "srgb".to_string() } else { "linear".to_string() };
        rt.environment_source_revision = rt.environment_source_revision.wrapping_add(1);
    });

    return texture;
}

pub fn update_gl_environment_cube_face(
    state: &GlRenderState,
    face: u32,
    data: &[u8],
    width: u32,
    height: u32,
) -> bool {
    let texture = get_gl_scene3d_runtime(state, |rt| rt.environment_source_cube);
    let texture = match texture {
        Some(t) => t,
        None => return false,
    };

    let gl = &state.gl;
    let srgb = get_gl_scene3d_runtime(state, |rt| rt.environment_source_cube_color_space == "srgb");
    let internal_format = if srgb { glow::SRGB8_ALPHA8 } else { glow::RGBA8 };

    unsafe {
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, Some(texture));
        gl.tex_image_2d(
            get_gl_cube_face_target(face),
            0,
            internal_format as i32,
            width as i32,
            height as i32,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            glow::PixelUnpackData::Slice(Some(data)),
        );
        gl.bind_texture(glow::TEXTURE_CUBE_MAP, None);
    }

    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.environment_source_revision = rt.environment_source_revision.wrapping_add(1);
    });

    return true;
}
