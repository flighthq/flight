use std::sync::Arc;

use flight_entity::{allocate_entity, throw_error};
use flight_geometry::{Matrix3, Vector2, clone_vector2, copy_vector2, inverse_matrix3};

use crate::sampler::{clone_sampler, copy_sampler, create_sampler, equals_sampler};
use crate::types::*;

// flight-lint: allow-file(contract-vocabulary) D16 general closed-family traits preserve the Texture union without a second runtime or flattened payload

const HALF_PI: f32 = std::f32::consts::FRAC_PI_2;

enum CapturedTextureSources {
    Texture2D(Option<TextureSourceRef>),
    Texture2DArray(Vec<Option<TextureSourceRef>>),
    Texture3D(Option<flight_entity::Ref<VoxelGrid>>),
    Cube(TextureSourceCubeFaces),
}

pub fn create_texture(opts: Option<&CreateTextureOptions>) -> Texture {
    return match opts {
        None => Texture::Texture2D(create_texture_2d()),
        Some(CreateTextureOptions::Texture2D(options)) => Texture::Texture2D(Texture2D {
            fields: create_texture_fields(Some(&options.common)),
            source: options.source.clone(),
        }),
        Some(CreateTextureOptions::Texture2DArray(options)) => {
            let mut out: Texture2DArray = allocate_entity();
            out.fields = create_texture_fields(Some(&options.common));
            out.sources = options.sources.clone().unwrap_or_default();
            Texture::Texture2DArray(out)
        }
        Some(CreateTextureOptions::Texture3D(options)) => {
            let mut out: Texture3D = allocate_entity();
            out.fields = create_texture_fields(Some(&options.common));
            out.source = options.source.clone();
            Texture::Texture3D(out)
        }
        Some(CreateTextureOptions::Cube(options)) => {
            let mut out: CubeTexture = allocate_entity();
            out.fields = create_texture_fields(Some(&options.common));
            out.sources = options
                .sources
                .clone()
                .unwrap_or_else(|| std::array::from_fn(|_| None));
            Texture::Cube(out)
        }
    };
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored texture fields after canonical construction
pub fn create_texture_2d() -> Texture2D {
    let mut out: Texture2D = allocate_entity();
    initialize_texture_2d(&mut out);
    return out;
}

fn create_texture_fields(opts: Option<&CreateTextureCommonOptions>) -> TextureFields {
    return TextureFields {
        runtime: Default::default(),
        color_space: opts
            .and_then(|value| value.color_space)
            .unwrap_or(TextureColorSpace::Srgb),
        flip_x: opts.and_then(|value| value.flip_x).unwrap_or(false),
        flip_y: opts.and_then(|value| value.flip_y).unwrap_or(false),
        sampler: opts
            .and_then(|value| value.sampler.as_ref())
            .map(clone_sampler)
            .unwrap_or_else(create_sampler),
        uv_offset: opts
            .and_then(|value| value.uv_offset.as_ref())
            .map(clone_vector2)
            .unwrap_or_else(|| flight_geometry::create_vector2(0.0, 0.0)),
        uv_rotation: opts.and_then(|value| value.uv_rotation).unwrap_or(0.0),
        uv_scale: opts
            .and_then(|value| value.uv_scale.as_ref())
            .map(clone_vector2)
            .unwrap_or_else(|| flight_geometry::create_vector2(1.0, 1.0)),
        version: opts.and_then(|value| value.version).unwrap_or(0),
    };
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical texture defaults before caller-authored assignment
pub fn initialize_texture_2d(out: &mut Texture2D) {
    let runtime = std::mem::take(&mut out.fields.runtime);
    out.fields = create_texture_fields(None);
    out.fields.runtime = runtime;
    out.source = None;
}

fn capture_texture_sources(source: &dyn TextureVariant) -> CapturedTextureSources {
    return match source.dimension() {
        TextureDimension::Texture2D => {
            CapturedTextureSources::Texture2D(source.source_2d().expect("2d source").clone())
        }
        TextureDimension::Texture2DArray => CapturedTextureSources::Texture2DArray(
            source.sources_2d_array().expect("2d-array sources").clone(),
        ),
        TextureDimension::Texture3D => {
            CapturedTextureSources::Texture3D(source.source_3d().expect("3d source").clone())
        }
        TextureDimension::Cube => {
            CapturedTextureSources::Cube(source.sources_cube().expect("cube sources").clone())
        }
    };
}

pub fn clone_texture(source: &dyn TextureVariant) -> Texture {
    let fields = clone_texture_fields(source.texture_fields());
    return match source.dimension() {
        TextureDimension::Texture2D => Texture::Texture2D(Texture2D {
            fields,
            source: source.source_2d().expect("2d source").clone(),
        }),
        TextureDimension::Texture2DArray => Texture::Texture2DArray(Texture2DArray {
            fields,
            sources: source.sources_2d_array().expect("2d-array sources").clone(),
        }),
        TextureDimension::Texture3D => Texture::Texture3D(Texture3D {
            fields,
            source: source.source_3d().expect("3d source").clone(),
        }),
        TextureDimension::Cube => Texture::Cube(CubeTexture {
            fields,
            sources: source.sources_cube().expect("cube sources").clone(),
        }),
    };
}

fn clone_texture_fields(source: &TextureFields) -> TextureFields {
    return TextureFields {
        runtime: Default::default(),
        color_space: source.color_space,
        flip_x: source.flip_x,
        flip_y: source.flip_y,
        sampler: clone_sampler(&source.sampler),
        uv_offset: clone_vector2(&source.uv_offset),
        uv_rotation: source.uv_rotation,
        uv_scale: clone_vector2(&source.uv_scale),
        version: source.version,
    };
}

pub fn copy_texture(out: &mut dyn TextureVariant, source: &dyn TextureVariant) {
    if out.dimension() != source.dimension() {
        throw_error("copyTexture requires matching dimensions");
    }

    let color_space = source.texture_fields().color_space;
    let flip_x = source.texture_fields().flip_x;
    let flip_y = source.texture_fields().flip_y;
    let sampler = clone_sampler(&source.texture_fields().sampler);
    let uv_offset = clone_vector2(&source.texture_fields().uv_offset);
    let uv_rotation = source.texture_fields().uv_rotation;
    let uv_scale = clone_vector2(&source.texture_fields().uv_scale);
    let version = source.texture_fields().version;
    let sources = capture_texture_sources(source);

    let fields = out.texture_fields_mut();
    copy_sampler(&mut fields.sampler, &sampler);
    copy_vector2(&mut fields.uv_offset, &uv_offset);
    copy_vector2(&mut fields.uv_scale, &uv_scale);
    fields.color_space = color_space;
    fields.flip_x = flip_x;
    fields.flip_y = flip_y;
    fields.uv_rotation = uv_rotation;
    fields.version = version;

    match sources {
        CapturedTextureSources::Texture2D(source) => {
            *out.source_2d_mut().expect("2d source") = source;
        }
        CapturedTextureSources::Texture2DArray(sources) => {
            *out.sources_2d_array_mut().expect("2d-array sources") = sources;
        }
        CapturedTextureSources::Texture3D(source) => {
            *out.source_3d_mut().expect("3d source") = source;
        }
        CapturedTextureSources::Cube(sources) => {
            *out.sources_cube_mut().expect("cube sources") = sources;
        }
    }
}

pub fn equals_texture(a: Option<&dyn TextureVariant>, b: Option<&dyn TextureVariant>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => {
            if std::ptr::eq(a, b) {
                return true;
            }
            let af = a.texture_fields();
            let bf = b.texture_fields();
            return af.color_space == bf.color_space
                && af.flip_x == bf.flip_x
                && af.flip_y == bf.flip_y
                && equals_texture_content(a, b)
                && af.uv_rotation == bf.uv_rotation
                && af.uv_offset.x == bf.uv_offset.x
                && af.uv_offset.y == bf.uv_offset.y
                && af.uv_scale.x == bf.uv_scale.x
                && af.uv_scale.y == bf.uv_scale.y
                && af.version == bf.version
                && equals_sampler(Some(&af.sampler), Some(&bf.sampler));
        }
        _ => false,
    };
}

fn equals_texture_content(a: &dyn TextureVariant, b: &dyn TextureVariant) -> bool {
    if a.dimension() != b.dimension() {
        return false;
    }
    return match a.dimension() {
        TextureDimension::Texture2D => source_option_ptr_eq(
            a.source_2d().expect("2d source"),
            b.source_2d().expect("2d source"),
        ),
        TextureDimension::Texture2DArray => source_slice_ptr_eq(
            a.sources_2d_array().expect("2d-array sources"),
            b.sources_2d_array().expect("2d-array sources"),
        ),
        TextureDimension::Texture3D => source_option_ptr_eq(
            a.source_3d().expect("3d source"),
            b.source_3d().expect("3d source"),
        ),
        TextureDimension::Cube => source_slice_ptr_eq(
            a.sources_cube().expect("cube sources"),
            b.sources_cube().expect("cube sources"),
        ),
    };
}

pub fn get_texture_height(texture: &dyn TextureVariant) -> i32 {
    return match get_texture_source(texture) {
        Some(source) => source.read().unwrap().texture_source_fields().height as i32,
        None => -1,
    };
}

pub fn get_texture_inverse_uv_matrix(out: &mut Matrix3, texture: &dyn TextureUvTransform) {
    get_texture_uv_matrix(out, texture);
    let source = out.clone();
    inverse_matrix3(out, &source);
}

pub fn get_texture_source(texture: &dyn TextureVariant) -> Option<TextureSourceRef> {
    return match texture.dimension() {
        TextureDimension::Texture2D => texture.source_2d().expect("2d source").clone(),
        TextureDimension::Texture2DArray => texture
            .sources_2d_array()
            .expect("2d-array sources")
            .iter()
            .find_map(Clone::clone),
        TextureDimension::Texture3D => texture
            .source_3d()
            .expect("3d source")
            .as_ref()
            .map(|source| source.clone() as TextureSourceRef),
        TextureDimension::Cube => texture
            .sources_cube()
            .expect("cube sources")
            .iter()
            .find_map(Clone::clone),
    };
}

pub fn get_texture_source_kind(texture: &dyn TextureVariant) -> Option<TextureSourceKind> {
    return get_texture_source(texture).map(|source| {
        return source.read().unwrap().texture_source_fields().kind.clone();
    });
}

pub fn get_texture_uv_matrix(out: &mut Matrix3, texture: &dyn TextureUvTransform) {
    let texture = texture.texture_fields();
    let r = texture.uv_rotation;
    let flip_scale_x = if texture.flip_x { -1.0 } else { 1.0 };
    let flip_scale_y = if texture.flip_y { -1.0 } else { 1.0 };
    let sx = texture.uv_scale.x * flip_scale_x;
    let sy = texture.uv_scale.y * flip_scale_y;
    let pre_offset_x = if texture.flip_x {
        texture.uv_scale.x
    } else {
        0.0
    };
    let pre_offset_y = if texture.flip_y {
        texture.uv_scale.y
    } else {
        0.0
    };
    let (cos_r, sin_r) = if r == 0.0 {
        (1.0, 0.0)
    } else if r == HALF_PI {
        (0.0, 1.0)
    } else if r == -HALF_PI {
        (0.0, -1.0)
    } else if r == std::f32::consts::PI || r == -std::f32::consts::PI {
        (-1.0, 0.0)
    } else {
        (r.cos(), r.sin())
    };
    let tx = texture.uv_offset.x + cos_r * pre_offset_x - sin_r * pre_offset_y;
    let ty = texture.uv_offset.y + sin_r * pre_offset_x + cos_r * pre_offset_y;
    out.m = [
        sx * cos_r,
        sx * sin_r,
        0.0,
        -sy * sin_r,
        sy * cos_r,
        0.0,
        tx,
        ty,
        1.0,
    ];
}

pub fn get_texture_view_size(out: &mut Vector2, texture: &dyn TextureVariant) {
    let source = match get_texture_source(texture) {
        Some(source) => source,
        None => {
            out.x = 0.0;
            out.y = 0.0;
            return;
        }
    };
    let source = source.read().unwrap();
    let width = source.texture_source_fields().width as f32;
    let height = source.texture_source_fields().height as f32;
    if width <= 0.0 || height <= 0.0 {
        out.x = 0.0;
        out.y = 0.0;
        return;
    }
    let fields = texture.texture_fields();
    let rotation = fields.uv_rotation;
    if rotation == 0.0 || rotation == std::f32::consts::PI || rotation == -std::f32::consts::PI {
        out.x = (width * fields.uv_scale.x).abs();
        out.y = (height * fields.uv_scale.y).abs();
        return;
    }
    if rotation == HALF_PI || rotation == -HALF_PI {
        out.x = (height * fields.uv_scale.x).abs();
        out.y = (width * fields.uv_scale.y).abs();
        return;
    }
    let cos_r = rotation.cos();
    let sin_r = rotation.sin();
    out.x = (width * fields.uv_scale.x * cos_r).hypot(height * fields.uv_scale.x * sin_r);
    out.y = (width * fields.uv_scale.y * sin_r).hypot(height * fields.uv_scale.y * cos_r);
}

pub fn get_texture_width(texture: &dyn TextureVariant) -> i32 {
    return match get_texture_source(texture) {
        Some(source) => source.read().unwrap().texture_source_fields().width as i32,
        None => -1,
    };
}

pub fn has_texture_source(texture: &dyn TextureVariant) -> bool {
    return get_texture_source_kind(texture).is_some();
}

pub fn has_texture_uv_transform(texture: &dyn TextureUvTransform) -> bool {
    let texture = texture.texture_fields();
    return texture.flip_x
        || texture.flip_y
        || texture.uv_scale.x != 1.0
        || texture.uv_scale.y != 1.0
        || texture.uv_offset.x != 0.0
        || texture.uv_offset.y != 0.0
        || texture.uv_rotation != 0.0;
}

pub fn is_texture_ready(texture: &dyn TextureVariant) -> bool {
    return has_texture_source(texture);
}

pub fn reset_texture_uv_transform(texture: &mut dyn TextureUvTransform) {
    let texture = texture.texture_fields_mut();
    texture.flip_x = false;
    texture.flip_y = false;
    texture.uv_offset.x = 0.0;
    texture.uv_offset.y = 0.0;
    texture.uv_rotation = 0.0;
    texture.uv_scale.x = 1.0;
    texture.uv_scale.y = 1.0;
}

pub fn set_texture_flip(texture: &mut dyn TextureUvTransform, flip_x: bool, flip_y: bool) {
    let texture = texture.texture_fields_mut();
    texture.flip_x = flip_x;
    texture.flip_y = flip_y;
}

pub fn set_texture_source(texture: &mut dyn TextureVariant, source: Option<TextureSourceRef>) {
    if texture.dimension() != TextureDimension::Texture2D {
        throw_error("setTextureSource requires a Texture2D");
    }
    let slot = texture.source_2d_mut().expect("2d source");
    if source_option_ptr_eq(slot, &source) {
        return;
    }
    *slot = source;
    let version = texture.texture_fields().version;
    texture.texture_fields_mut().version = version.wrapping_add(1);
}

pub fn set_texture_uv_from_pixel_rect(
    texture: &mut dyn TextureVariant,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) {
    let texture_width = get_texture_width(texture);
    let texture_height = get_texture_height(texture);
    let fields = texture.texture_fields_mut();
    if texture_width <= 0 || texture_height <= 0 {
        fields.uv_offset.x = 0.0;
        fields.uv_offset.y = 0.0;
        fields.uv_scale.x = 0.0;
        fields.uv_scale.y = 0.0;
        return;
    }
    fields.uv_offset.x = x / texture_width as f32;
    fields.uv_offset.y = y / texture_height as f32;
    fields.uv_scale.x = width / texture_width as f32;
    fields.uv_scale.y = height / texture_height as f32;
}

pub fn set_texture_uv_offset(texture: &mut dyn TextureUvTransform, x: f32, y: f32) {
    let texture = texture.texture_fields_mut();
    texture.uv_offset.x = x;
    texture.uv_offset.y = y;
}

pub fn set_texture_uv_rotation(texture: &mut dyn TextureUvTransform, radians: f32) {
    texture.texture_fields_mut().uv_rotation = radians;
}

pub fn set_texture_uv_scale(texture: &mut dyn TextureUvTransform, x: f32, y: f32) {
    let texture = texture.texture_fields_mut();
    texture.uv_scale.x = x;
    texture.uv_scale.y = y;
}

fn source_option_ptr_eq<T: ?Sized>(
    a: &Option<flight_entity::Ref<T>>,
    b: &Option<flight_entity::Ref<T>>,
) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        (None, None) => true,
        _ => false,
    };
}

fn source_slice_ptr_eq(a: &[Option<TextureSourceRef>], b: &[Option<TextureSourceRef>]) -> bool {
    return a.len() == b.len()
        && a.iter()
            .zip(b.iter())
            .all(|(a, b)| source_option_ptr_eq(a, b));
}

pub fn transform_texture_uv(out: &mut Vector2, texture: &dyn TextureUvTransform, u: f32, v: f32) {
    let texture = texture.texture_fields();
    let fu = if texture.flip_x { 1.0 - u } else { u };
    let fv = if texture.flip_y { 1.0 - v } else { v };
    let cos_r = texture.uv_rotation.cos();
    let sin_r = texture.uv_rotation.sin();
    let sx = texture.uv_scale.x;
    let sy = texture.uv_scale.y;
    let tx = texture.uv_offset.x;
    let ty = texture.uv_offset.y;
    out.x = sx * cos_r * fu - sy * sin_r * fv + tx;
    out.y = sx * sin_r * fu + sy * cos_r * fv + ty;
}
