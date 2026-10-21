//! Nine-slice sprites (TS `scale9Sprite.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;

use crate::display_object::create_node2d;
use crate::sprite::create_sprite_runtime;
use crate::types::*;

/// Allocates a nine-slice sprite over `scale9_grid` (TS `createScale9Sprite`).
pub fn create_scale9_sprite(
    scale9_grid: &Rectangle,
    obj: Option<&PartialScale9Sprite>,
) -> Ref<Scale9Sprite> {
    let mut out: Scale9Sprite = create_node2d(
        SCALE9_SPRITE_KIND.to_string(),
        obj.map(|obj| &obj.node),
        Some(create_scale9_sprite_runtime),
    );
    out.data = create_scale9_sprite_data(scale9_grid, obj.and_then(|obj| obj.data.as_ref()));
    out.sprite_runtime = Arc::new(RwLock::new(SpriteRuntime::default()));
    return Arc::new(RwLock::new(out));
}

/// Allocates nine-slice kind data (TS `createScale9SpriteData`).
pub fn create_scale9_sprite_data(
    scale9_grid: &Rectangle,
    data: Option<&Scale9SpriteDataOptions>,
) -> Scale9SpriteData {
    let mut out: Scale9SpriteData = allocate_entity();
    initialize_scale9_sprite_data(&mut out, scale9_grid, data);
    return out;
}

/// The nine-slice sprite's runtime tier: a sprite runtime (TS `createScale9SpriteRuntime`).
pub fn create_scale9_sprite_runtime() -> Node2DRuntime {
    return create_sprite_runtime();
}

/// The construction initializer of `create_scale9_sprite_data` (TS `initializeScale9SpriteData`).
pub fn initialize_scale9_sprite_data(
    out: &mut Scale9SpriteData,
    scale9_grid: &Rectangle,
    data: Option<&Scale9SpriteDataOptions>,
) {
    out.scale9_grid = scale9_grid.clone();
    out.texture = data.and_then(|data| data.texture.clone());
}

/// The nine-slice sprite's own runtime fields (TS `getScale9SpriteRuntime`).
pub fn get_scale9_sprite_runtime(source: &Scale9Sprite) -> Ref<Scale9SpriteRuntime> {
    return source.sprite_runtime.clone();
}
