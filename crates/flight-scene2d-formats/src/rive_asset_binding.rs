use std::sync::{Arc, LazyLock, Mutex, RwLock, Weak};

use flight_entity::Ref;
use flight_scene2d::{
    Node2D, Node2DRef, PartialNode2D, PartialSprite, SpriteDataOptions, create_sprite,
};
use flight_texture::{CreateTexture2DOptions, Texture, create_texture_2d};

struct RiveAssetBinding {
    image_asset_index: Option<i32>,
    image_texture: Option<Ref<Texture>>,
    nested_artboard_index: Option<i32>,
    node: Weak<RwLock<dyn Node2D>>,
}

// flight-lint: allow(hidden-state) source-equivalent weak side tables keep format marks off generic display nodes and retain no node strongly
static RIVE_ASSET_BINDINGS: LazyLock<Mutex<Vec<RiveAssetBinding>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

pub fn create_rive_image_sprite(name: &str, asset_index: i32) -> Node2DRef {
    let texture = Arc::new(RwLock::new(Texture::Texture2D(create_texture_2d(Some(
        &CreateTexture2DOptions::default(),
    )))));
    let sprite: Node2DRef = create_sprite(Some(&PartialSprite {
        data: Some(SpriteDataOptions {
            texture: Some(texture.clone()),
        }),
        node: PartialNode2D {
            name: Some(name.to_string()),
            ..PartialNode2D::default()
        },
    }));
    let mut bindings = RIVE_ASSET_BINDINGS.lock().unwrap();
    remove_expired_bindings(&mut bindings);
    bindings.push(RiveAssetBinding {
        image_asset_index: Some(asset_index),
        image_texture: Some(texture),
        nested_artboard_index: None,
        node: Arc::downgrade(&sprite),
    });
    return sprite;
}

fn find_binding<'a>(
    bindings: &'a [RiveAssetBinding],
    node: &Node2DRef,
) -> Option<&'a RiveAssetBinding> {
    return bindings.iter().find(|binding| {
        binding
            .node
            .upgrade()
            .is_some_and(|candidate| Arc::ptr_eq(&candidate, node))
    });
}

fn find_binding_mut<'a>(
    bindings: &'a mut [RiveAssetBinding],
    node: &Node2DRef,
) -> Option<&'a mut RiveAssetBinding> {
    return bindings.iter_mut().find(|binding| {
        binding
            .node
            .upgrade()
            .is_some_and(|candidate| Arc::ptr_eq(&candidate, node))
    });
}

pub fn get_rive_image_asset_index(node: &Node2DRef) -> i32 {
    let mut bindings = RIVE_ASSET_BINDINGS.lock().unwrap();
    remove_expired_bindings(&mut bindings);
    return find_binding(&bindings, node)
        .and_then(|binding| binding.image_asset_index)
        .unwrap_or(RIVE_NO_INDEX);
}

pub fn get_rive_image_texture(node: &Node2DRef) -> Option<Ref<Texture>> {
    let mut bindings = RIVE_ASSET_BINDINGS.lock().unwrap();
    remove_expired_bindings(&mut bindings);
    return find_binding(&bindings, node).and_then(|binding| binding.image_texture.clone());
}

pub fn get_rive_nested_artboard_index(node: &Node2DRef) -> i32 {
    let mut bindings = RIVE_ASSET_BINDINGS.lock().unwrap();
    remove_expired_bindings(&mut bindings);
    return find_binding(&bindings, node)
        .and_then(|binding| binding.nested_artboard_index)
        .unwrap_or(RIVE_NO_INDEX);
}

pub fn mark_rive_nested_artboard(node: &Node2DRef, artboard_index: i32) {
    let mut bindings = RIVE_ASSET_BINDINGS.lock().unwrap();
    remove_expired_bindings(&mut bindings);
    if let Some(binding) = find_binding_mut(&mut bindings, node) {
        binding.nested_artboard_index = Some(artboard_index);
        return;
    }
    bindings.push(RiveAssetBinding {
        image_asset_index: None,
        image_texture: None,
        nested_artboard_index: Some(artboard_index),
        node: Arc::downgrade(node),
    });
}

fn remove_expired_bindings(bindings: &mut Vec<RiveAssetBinding>) {
    bindings.retain(|binding| binding.node.strong_count() != 0);
}

const RIVE_NO_INDEX: i32 = -1;
