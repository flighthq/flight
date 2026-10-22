use std::sync::Arc;

use crate::texture::{clone_texture, copy_texture, equals_texture};
use crate::types::*;

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored cube fields after canonical construction
pub fn create_cube_texture() -> CubeTexture {
    let mut out = flight_entity::allocate_entity();
    initialize_cube_texture(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D23 (I): public canonical construction initializer absent from the pinned source
pub fn initialize_cube_texture(out: &mut CubeTexture) {
    let runtime = std::mem::take(&mut out.fields.runtime);
    out.fields = TextureFields::default();
    out.fields.runtime = runtime;
    out.sources = std::array::from_fn(|_| None);
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
