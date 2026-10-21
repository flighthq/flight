use std::sync::Arc;

use crate::sampler::clone_sampler;
use crate::texture::{clone_texture, copy_texture, equals_texture};
use crate::types::*;

pub fn create_cube_texture(opts: Option<&CreateCubeTextureOptions>) -> CubeTexture {
    let common = CreateTextureCommonOptions {
        color_space: opts.and_then(|value| value.color_space),
        sampler: opts
            .and_then(|value| value.sampler.as_ref())
            .map(clone_sampler),
        ..CreateTextureCommonOptions::default()
    };
    let general = CreateTextureOptions::Cube(CreateTextureCubeOptions {
        common,
        sources: opts.and_then(|value| value.sources.clone()),
    });
    return match crate::texture::create_texture(Some(&general)) {
        Texture::Cube(cube) => cube,
        _ => unreachable!(),
    };
}

pub fn clone_cube_texture(source: &CubeTexture) -> CubeTexture {
    return match clone_texture(source) {
        Texture::Cube(cube) => cube,
        _ => unreachable!(),
    };
}

pub fn copy_cube_texture(out: &mut CubeTexture, source: &CubeTexture) {
    return copy_texture(out, source);
}

pub fn equals_cube_texture(a: Option<&CubeTexture>, b: Option<&CubeTexture>) -> bool {
    return equals_texture(
        a.map(|value| value as &dyn TextureVariant),
        b.map(|value| value as &dyn TextureVariant),
    );
}

pub fn get_cube_texture_face_size(cube: &CubeTexture) -> i32 {
    for face in &cube.sources {
        if let Some(face) = face {
            return face.read().unwrap().texture_source_fields().width as i32;
        }
    }
    return -1;
}

pub fn is_cube_texture_complete(cube: &CubeTexture) -> bool {
    return cube.sources.iter().all(Option::is_some);
}

pub fn set_cube_texture_face(
    cube: &mut CubeTexture,
    face_index: usize,
    source: Option<TextureSourceRef>,
) {
    let existing = &cube.sources[face_index];
    let unchanged = match (existing, &source) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        (None, None) => true,
        _ => false,
    };
    if unchanged {
        return;
    }
    cube.sources[face_index] = source;
    cube.version = cube.version.wrapping_add(1);
}
