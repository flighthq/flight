//! Nine-slice sprites (TS `scale9Sprite.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;

use crate::display_object::create_node2d;
use crate::sprite::create_sprite_runtime;
use crate::types::*;

/// Allocates a nine-slice sprite over `scale9_grid` (TS `createScale9Sprite`).
// flight-lint: allow(conform-params) D23 B: authored options removed; scale9_grid is required defining ref
pub fn create_scale9_sprite(scale9_grid: &Rectangle) -> Ref<Scale9Sprite> {
    let mut out: Scale9Sprite = create_node2d(
        SCALE9_SPRITE_KIND.to_string(),
        None,
        Some(create_scale9_sprite_runtime),
    );
    initialize_scale9_sprite(&mut out, scale9_grid);
    return crate::display_object::publish_node2d(out);
}

/// Allocates nine-slice kind data (TS `createScale9SpriteData`).
// flight-lint: allow(conform-params) D23 B: authored options removed; scale9_grid is required defining ref
pub fn create_scale9_sprite_data(scale9_grid: &Rectangle) -> Scale9SpriteData {
    let mut out: Scale9SpriteData = allocate_entity();
    initialize_scale9_sprite_data(&mut out, scale9_grid);
    return out;
}

/// The nine-slice sprite's runtime tier: a sprite runtime (TS `createScale9SpriteRuntime`).
pub fn create_scale9_sprite_runtime() -> Node2DRuntime {
    return create_sprite_runtime();
}

/// The construction initializer of `create_scale9_sprite` (TS `initializeScale9Sprite`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_scale9_sprite
pub fn initialize_scale9_sprite(out: &mut Scale9Sprite, scale9_grid: &Rectangle) {
    out.data = create_scale9_sprite_data(scale9_grid);
    out.sprite_runtime = Arc::new(RwLock::new(SpriteRuntime::default()));
}

/// The construction initializer of `create_scale9_sprite_data` (TS `initializeScale9SpriteData`).
// flight-lint: allow(conform-params) Principal c0f9227c D23: restore defaults before authored field assignment
pub fn initialize_scale9_sprite_data(out: &mut Scale9SpriteData, scale9_grid: &Rectangle) {
    out.scale9_grid = scale9_grid.clone();
    out.texture = None;
}

/// The nine-slice sprite's own runtime fields (TS `getScale9SpriteRuntime`).
pub fn get_scale9_sprite_runtime(source: &Scale9Sprite) -> Ref<Scale9SpriteRuntime> {
    return source.sprite_runtime.clone();
}
