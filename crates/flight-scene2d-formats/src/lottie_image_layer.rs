use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_importdiagnostics::contract::ImportDiagnosticDetailValue;
use flight_node::contract::{NodeRef, add_node_child};
use flight_scene2d::contract::{PartialSprite, SpriteDataOptions, create_sprite};
use flight_texture::contract::{
    CreateTexture2DOptions, CreateTextureOptions, TextureSourceRef, create_texture,
};

use crate::lottie_document::{report_lottie_drop, report_lottie_skip};
use crate::types::LottieLayerContext;

fn detail_id(id: &str) -> HashMap<String, ImportDiagnosticDetailValue> {
    return HashMap::from([(
        "id".to_string(),
        ImportDiagnosticDetailValue::String(id.to_string()),
    )]);
}

pub fn lottie_image_layer_handler(context: &mut LottieLayerContext<'_, '_>) {
    let id = context
        .layer
        .get("refId")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let Some(asset) = context.import.assets.get(id) else {
        report_lottie_drop(
            context.import,
            "lottie.unresolved-asset",
            "appendLottieImage",
            Some(detail_id(id)),
        );
        return;
    };
    if !asset.contains_key("p") {
        report_lottie_drop(
            context.import,
            "lottie.unresolved-asset",
            "appendLottieImage",
            Some(detail_id(id)),
        );
        return;
    }
    let Some(image) = context
        .import
        .resolve_image_resource
        .as_ref()
        .and_then(|resolve| resolve(asset))
    else {
        report_lottie_skip(
            context.import,
            "lottie.unresolved-image",
            "appendLottieImage",
            Some(detail_id(id)),
        );
        return;
    };
    let source: TextureSourceRef = image;
    let texture = Arc::new(RwLock::new(create_texture(Some(
        &CreateTextureOptions::Texture2D(CreateTexture2DOptions {
            source: Some(source),
            ..CreateTexture2DOptions::default()
        }),
    ))));
    let sprite = create_sprite(Some(&PartialSprite {
        data: Some(SpriteDataOptions {
            texture: Some(texture),
        }),
        ..PartialSprite::default()
    }));
    let parent: NodeRef = context.container.clone();
    let child: NodeRef = sprite;
    add_node_child(&parent, &child);
}
