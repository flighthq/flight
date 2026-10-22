use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap};
use flight_entity::{Ref, allocate_entity};
use flight_image::{COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND, CompressedImageResource};

use crate::types::*;

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored atlas fields after canonical construction
pub fn create_texture_atlas() -> Ref<TextureAtlas> {
    let mut out: TextureAtlas = allocate_entity();
    initialize_texture_atlas(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Restores the canonical empty atlas fields while preserving entity identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization restores defaults before caller-authored assignment
pub fn initialize_texture_atlas(out: &mut TextureAtlas) {
    out.image_height = 0.0;
    out.image_name = None;
    out.image_width = 0.0;
    out.regions.clear();
    out.scale = 1.0;
    out.texture = None;
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
