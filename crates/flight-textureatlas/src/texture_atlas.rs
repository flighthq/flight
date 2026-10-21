use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap};
use flight_entity::{Ref, allocate_entity};
use flight_image::{COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND, CompressedImageResource};

use crate::types::*;

pub fn create_texture_atlas(obj: Option<TextureAtlasOptions>) -> Ref<TextureAtlas> {
    let mut out: TextureAtlas = allocate_entity();
    initialize_texture_atlas(&mut out, obj);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_texture_atlas`: every field from `obj`, or its default.
/// A provided `regions` vector is taken as the atlas's own.
pub fn initialize_texture_atlas(out: &mut TextureAtlas, obj: Option<TextureAtlasOptions>) {
    let obj = obj.unwrap_or_default();
    out.image_height = obj.image_height.unwrap_or(0.0);
    out.image_name = obj.image_name;
    out.image_width = obj.image_width.unwrap_or(0.0);
    out.regions = obj.regions.unwrap_or_default();
    out.scale = obj.scale.unwrap_or(1.0);
    out.texture = obj.texture;
}

/// Releases what keeps the atlas reachable: drops its regions and its texture reference. The texture
/// itself is not destroyed (the caller supplied it and may still use it); afterwards the atlas is
/// empty and reusable, not invalid.
pub fn dispose_texture_atlas(atlas: &mut TextureAtlas) {
    atlas.regions.clear();
    atlas.texture = None;
}

/// The byte footprint of the page texture's CPU-side image data: a Bitmap's pixel bytes or a
/// compressed image's payload. Produced and unbound textures have no CPU footprint (0).
pub fn get_texture_atlas_byte_size(atlas: &TextureAtlas) -> usize {
    let Some(texture) = &atlas.texture else {
        return 0;
    };
    let Some(source) = texture.read().unwrap().source.clone() else {
        return 0;
    };
    let guard = source.read().unwrap();
    let kind = guard.texture_source_fields().kind.clone();
    let any: &dyn Any = &*guard;
    if kind == BITMAP_TEXTURE_SOURCE_KIND {
        return any
            .downcast_ref::<Bitmap>()
            .map_or(0, |bitmap| bitmap.data.len());
    }
    if kind == COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND {
        return any
            .downcast_ref::<CompressedImageResource>()
            .map_or(0, |image| image.compressed.payload.read().unwrap().len());
    }
    return 0;
}
