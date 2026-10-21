use flight_entity::Ref;
use flight_geometry::{Rectangle, create_rectangle};

use crate::types::{GlyphAtlas, get_glyph_atlas_runtime};

pub fn clear_glyph_atlas_dirty(atlas: &Ref<GlyphAtlas>) {
    get_glyph_atlas_runtime(atlas).write().unwrap().dirty = false;
}

pub fn get_glyph_atlas_dirty_region(atlas: &Ref<GlyphAtlas>) -> Option<Rectangle> {
    let runtime = get_glyph_atlas_runtime(atlas);
    let runtime = runtime.read().unwrap();
    if !runtime.dirty {
        return None;
    }
    return Some(create_rectangle(
        runtime.dirty_min_x as f32,
        runtime.dirty_min_y as f32,
        (runtime.dirty_max_x - runtime.dirty_min_x) as f32,
        (runtime.dirty_max_y - runtime.dirty_min_y) as f32,
    ));
}
