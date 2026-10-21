//! Texture-backed sprites (TS `sprite.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Rectangle, create_vector2};
use flight_node::{Node, RendererData};
use flight_texture::{Texture, TextureUvTransform, get_texture_view_size};

use crate::display_object::{create_node2d, create_node2d_runtime};
use crate::types::*;

/// Allocates a sprite (TS `createSprite`).
pub fn create_sprite(obj: Option<&PartialSprite>) -> Ref<Sprite> {
    let mut out: Sprite = create_node2d(
        SPRITE_KIND.to_string(),
        obj.map(|obj| &obj.node),
        Some(create_sprite_runtime),
    );
    out.data = create_sprite_data(obj.and_then(|obj| obj.data.as_ref()));
    out.sprite_runtime = Arc::new(RwLock::new(SpriteRuntime::default()));
    return crate::display_object::publish_node2d(out);
}

/// Allocates sprite kind data (TS `createSpriteData`).
pub fn create_sprite_data(data: Option<&SpriteDataOptions>) -> SpriteData {
    let mut out: SpriteData = allocate_entity();
    initialize_sprite_data(&mut out, data);
    return out;
}

/// Allocates the per-pipeline texture identity stamp of a sprite renderer's optional dirty hook
/// (TS `createSpriteRendererData`, without the unused render-state parameter per Principal
/// db87e24b).
// flight-lint: allow(conform-params) Principal db87e24b 5c: the unused render-state parameter is removed in Rust and TS
pub fn create_sprite_renderer_data(source: &dyn Node) -> SpriteIdentityRendererData {
    let mut out: SpriteIdentityRendererData = allocate_entity();
    initialize_sprite_renderer_data(&mut out, source);
    return out;
}

/// The sprite's 2D runtime tier with the texture-aware bounds computation and validity hook
/// installed (TS `createSpriteRuntime`). Its own stamp fields (`SpriteRuntime`) start empty on the
/// sprite itself.
pub fn create_sprite_runtime() -> Node2DRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(compute_sprite_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: Some(Arc::new(is_sprite_local_bounds_rectangle_valid)),
    };
    return create_node2d_runtime(Some(&methods));
}

/// The construction initializer of `create_sprite_data` (TS `initializeSpriteData`).
pub fn initialize_sprite_data(out: &mut SpriteData, data: Option<&SpriteDataOptions>) {
    out.texture = data.and_then(|data| data.texture.clone());
}

/// The construction initializer of `create_sprite_renderer_data`: stamps the sprite's current
/// texture identity and version (TS `initializeSpriteRendererData`).
// flight-lint: allow(conform-params) Principal db87e24b 5c: the unused render-state parameter is removed in Rust and TS
pub fn initialize_sprite_renderer_data(out: &mut SpriteIdentityRendererData, source: &dyn Node) {
    let texture = get_sprite_texture(source);
    out.texture_version = get_texture_version(&texture);
    out.texture_identity = texture;
}

/// A fresh sprite sharing the source's texture (TS `cloneSprite`).
pub fn clone_sprite(source: &Sprite) -> Ref<Sprite> {
    let obj = PartialSprite {
        data: Some(SpriteDataOptions {
            texture: source.data.texture.clone(),
        }),
        ..PartialSprite::default()
    };
    return create_sprite(Some(&obj));
}

/// Sizes the local bounds from the texture's view size, or zero without a texture, and stamps the
/// texture identity and version the bounds were computed from (TS
/// `computeSpriteLocalBoundsRectangle`). Accepts any sprite kind (`Sprite`, `Scale9Sprite`); the
/// source's cast reads `data.texture` structurally.
pub fn compute_sprite_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let Some((texture, runtime)) = get_sprite_parts(source) else {
        out.width = 0.0;
        out.height = 0.0;
        return;
    };
    match texture {
        None => {
            out.width = 0.0;
            out.height = 0.0;
        }
        Some(texture) => {
            let mut size = create_vector2(0.0, 0.0);
            get_texture_view_size(&mut size, &*texture.read().unwrap());
            out.width = size.x;
            out.height = size.y;
        }
    }
    let mut runtime = runtime.write().unwrap();
    runtime.local_bounds_texture = texture.clone();
    runtime.local_bounds_texture_version = get_texture_version(texture);
}

fn get_sprite_parts(source: &dyn Node) -> Option<(&Option<Ref<Texture>>, &Ref<SpriteRuntime>)> {
    if let Some(sprite) = source.as_any().downcast_ref::<Sprite>() {
        return Some((&sprite.data.texture, &sprite.sprite_runtime));
    }
    if let Some(sprite) = source.as_any().downcast_ref::<Scale9Sprite>() {
        return Some((&sprite.data.texture, &sprite.sprite_runtime));
    }
    return None;
}

/// The sprite's own runtime fields: the texture stamp of its cached local bounds (TS
/// `getSpriteRuntime`; the inherited tier is `get_node2d_runtime`).
pub fn get_sprite_runtime(source: &Sprite) -> Ref<SpriteRuntime> {
    return source.sprite_runtime.clone();
}

fn get_sprite_texture(source: &dyn Node) -> Option<Ref<Texture>> {
    return get_sprite_parts(source).and_then(|(texture, _)| texture.clone());
}

/// The texture's version, or `-1` without one (TS `texture?.version ?? -1`).
pub(crate) fn get_texture_version(texture: &Option<Ref<Texture>>) -> i64 {
    return match texture {
        Some(texture) => texture.read().unwrap().texture_fields().version as i64,
        None => -1,
    };
}

fn is_same_texture(a: &Option<Ref<Texture>>, b: &Option<Ref<Texture>>) -> bool {
    return match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        _ => false,
    };
}

fn is_sprite_local_bounds_rectangle_valid(source: &dyn Node) -> bool {
    let Some((texture, runtime)) = get_sprite_parts(source) else {
        return true;
    };
    let runtime = runtime.read().unwrap();
    return is_same_texture(&runtime.local_bounds_texture, texture)
        && runtime.local_bounds_texture_version == get_texture_version(texture);
}

/// Whether the sprite's texture identity or version changed since the stamp, restamping it (TS
/// `isSpriteRendererDirty`, without the unused render-state parameter). `false` without data.
// flight-lint: allow(conform-params) Principal db87e24b 5c: the unused render-state parameter is removed in Rust and TS
// flight-lint: allow(contract-vocabulary) Principal db87e24b 5c: renderer data is the open flight-node RendererData family, taken as `&mut dyn RendererData` and narrowed with `as_any_mut`
pub fn is_sprite_renderer_dirty(
    source: &dyn Node,
    renderer_data: Option<&mut dyn RendererData>,
) -> bool {
    let Some(renderer_data) = renderer_data else {
        return false;
    };
    let Some(data) = renderer_data
        .as_any_mut()
        .downcast_mut::<SpriteIdentityRendererData>()
    else {
        return false;
    };
    let texture = get_sprite_texture(source);
    let version = get_texture_version(&texture);
    let dirty =
        !is_same_texture(&data.texture_identity, &texture) || data.texture_version != version;
    data.texture_identity = texture;
    data.texture_version = version;
    return dirty;
}
