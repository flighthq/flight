use crate::shared::create_external_texture_ref;
use flight_entity::Ref;
use flight_scene3d::Scene3DDocument;
use flight_texture::{Texture, TextureColorSpace, TextureUvTransform};

// flight-lint: allow(f64) D1 exact-integer rule: losslessly promote the canonical input before source Number multiplication and rounding; 0x3f010101 must pack to byte128, not129; public scalar remains f32
pub fn clamp_channel(value: f32) -> f32 {
    return (f64::from(value).clamp(0.0, 1.0) * 255.0).round() as f32 + 0.0;
}

// flight-lint: allow(conform-params) D9 required mutable document destination precedes URI input; source order is uri,document,colorSpace
pub fn external_obj_texture(
    out: &mut Scene3DDocument,
    uri: Option<&str>,
    color_space: TextureColorSpace,
) -> Option<Ref<Texture>> {
    let uri = uri?;
    let texture = create_external_texture_ref(uri, None, Some(&mut out.resources));
    texture.write().unwrap().texture_fields_mut().color_space = color_space;
    return Some(texture);
}

pub fn pack_obj_color(rgb: &[f32; 3], alpha: f32) -> u32 {
    return ((clamp_channel(rgb[0]) as u32) << 24)
        | ((clamp_channel(rgb[1]) as u32) << 16)
        | ((clamp_channel(rgb[2]) as u32) << 8)
        | (clamp_channel(alpha) as u32);
}
